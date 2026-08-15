-- Envoi quotidien : sélection par utilisateur, file des profils à notifier,
-- traçabilité, et déclencheur du cron.
--
-- Le cron sert des gens qui ne sont pas connectés : auth.uid() n'existe pas
-- dans ce contexte, d'où la variante paramétrée de la sélection.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.get_daily_anecdote_for(p_user uuid)
returns public.anecdotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_today date;
  v_anecdote public.anecdotes;
begin
  if p_user is null then
    return null;
  end if;

  select * into v_profile from public.profiles where id = p_user;
  if not found or coalesce(v_profile.city_place_id, v_profile.city) is null then
    return null;
  end if;

  v_today := (now() at time zone coalesce(v_profile.timezone, 'UTC'))::date;

  select a.* into v_anecdote
    from public.user_anecdote_history h
    join public.anecdotes a on a.id = h.anecdote_id
   where h.user_id = p_user and h.sent_on = v_today
   limit 1;

  if found then
    return v_anecdote;
  end if;

  select a.* into v_anecdote
    from public.anecdotes a
   where a.status = 'validated'
     and case
           when v_profile.city_place_id is not null
             then a.city_place_id = v_profile.city_place_id
           else a.city = v_profile.city
         end
     and not exists (
       select 1 from public.user_anecdote_history h
        where h.user_id = p_user and h.anecdote_id = a.id
     )
   order by a.reuse_count, random()
   limit 1;

  if not found then
    return null;
  end if;

  insert into public.user_anecdote_history (user_id, anecdote_id, sent_on)
  values (p_user, v_anecdote.id, v_today)
  on conflict (user_id, sent_on) do nothing;

  if not found then
    select a.* into v_anecdote
      from public.user_anecdote_history h
      join public.anecdotes a on a.id = h.anecdote_id
     where h.user_id = p_user and h.sent_on = v_today
     limit 1;
    return v_anecdote;
  end if;

  update public.anecdotes set reuse_count = reuse_count + 1 where id = v_anecdote.id;
  v_anecdote.reuse_count := v_anecdote.reuse_count + 1;
  return v_anecdote;
end;
$$;

revoke execute on function public.get_daily_anecdote_for(uuid) from public, anon, authenticated;
grant execute on function public.get_daily_anecdote_for(uuid) to service_role;

-- L'appel depuis l'app n'est plus qu'une façade sur l'identité du jeton.
create or replace function public.get_daily_anecdote()
returns public.anecdotes
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;
  return public.get_daily_anecdote_for(auth.uid());
end;
$$;

revoke execute on function public.get_daily_anecdote() from public, anon;
grant execute on function public.get_daily_anecdote() to authenticated;

-- Qui doit être notifié maintenant. Le modulo 1440 gère l'heure de
-- notification proche de minuit, dont la fenêtre déborde sur le lendemain.
create or replace function public.profiles_a_notifier(p_window_minutes int default 15)
returns table (user_id uuid, expo_push_token text)
language sql
security definer
set search_path = public
as $$
  with base as (
    select p.id,
           p.expo_push_token,
           p.notification_hour,
           coalesce(p.city_place_id, p.city) as ville,
           (now() at time zone coalesce(p.timezone, 'UTC')) as heure_locale
      from public.profiles p
  )
  select b.id, b.expo_push_token
    from base b
   where b.expo_push_token is not null
     and b.ville is not null
     and mod(
           (extract(epoch from b.heure_locale::time)::int
            - extract(epoch from b.notification_hour)::int) / 60 + 1440,
           1440
         ) < p_window_minutes
     -- Déjà servi aujourd'hui : soit le cron est passé, soit la personne a
     -- ouvert l'app d'elle-même. Dans les deux cas, rien à envoyer.
     and not exists (
       select 1 from public.user_anecdote_history h
        where h.user_id = b.id and h.sent_on = b.heure_locale::date
     );
$$;

revoke execute on function public.profiles_a_notifier(int) from public, anon, authenticated;
grant execute on function public.profiles_a_notifier(int) to service_role;

-- Sans trace, l'échec du cron est silencieux : les gens cessent simplement de
-- recevoir leur anecdote, et on l'apprend par un désabonnement.
create table if not exists public.notification_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  due_count int not null default 0,
  sent_count int not null default 0,
  error_count int not null default 0,
  details jsonb
);

alter table public.notification_runs enable row level security;

create index if not exists notification_runs_ran_at_idx
  on public.notification_runs (ran_at desc);

-- Déclencheur du cron. Les secrets vivent dans Vault, pas dans cron.job, dont
-- le contenu est lisible en clair.
create or replace function public.declencher_envoi_notifications()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'anecto_functions_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'anecto_admin_secret';

  if v_url is null or v_secret is null then
    raise exception 'Secrets anecto_functions_url / anecto_admin_secret absents de Vault';
  end if;

  select net.http_post(
           url := v_url || '/send-daily-notifications',
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'x-anecto-admin-secret', v_secret
           ),
           body := '{}'::jsonb,
           timeout_milliseconds := 60000
         ) into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function public.declencher_envoi_notifications() from public, anon, authenticated;

-- Planification : à exécuter une fois les secrets déposés dans Vault.
--
--   select vault.create_secret(
--     'https://<ref>.supabase.co/functions/v1', 'anecto_functions_url');
--   select vault.create_secret('<ANECTO_ADMIN_SECRET>', 'anecto_admin_secret');
--   select cron.schedule('anecto-notifications', '*/15 * * * *',
--                        $job$select public.declencher_envoi_notifications()$job$);
