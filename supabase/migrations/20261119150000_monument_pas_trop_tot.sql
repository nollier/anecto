-- Un même monument, pas deux fois à intervalle trop proche.
--
-- Le 19 novembre, une lectrice de Bordeaux a reçu deux anecdotes sur l'hôtel
-- de la rue Labottière, le 15 et le 19. Deux anecdotes différentes, écrites
-- le 17 août avant le contrôle des doublons à la production : le tirage du
-- jour évitait la même anecdote, pas le même lieu.
--
-- Les règles, fixées le 19 novembre :
--
--   1. Chaque anecdote porte la clé du monument dont elle parle
--      (`anecdotes.monument`), posée par la fonction `monuments` (DeepSeek,
--      une ville à la fois). Nulle quand le sujet est une personne ou un
--      événement.
--   2. Un monument servi à un lecteur ces 20 derniers jours passe après tout
--      le reste de sa ville. On ne l'écarte pas : s'il ne reste que lui, il
--      vaut mieux une anecdote que rien.
--   3. La ville du lecteur reste prioritaire sur les voisines.

alter table public.anecdotes
  add column if not exists monument text,
  add column if not exists monument_calcule_at timestamptz;

create index if not exists anecdotes_monument
  on public.anecdotes (city_place_id, monument)
  where monument is not null;

-- La prochaine ville qui a des anecdotes à classer : celles des lecteurs
-- d'abord, les plus fournies ensuite.
create or replace function public.ville_monuments_a_classer()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.city_place_id
    from public.anecdotes a
   where a.status in ('validated', 'draft')
     and a.city_place_id is not null
     and a.monument_calcule_at is null
   group by a.city_place_id
   order by exists (select 1 from public.profiles p where p.city_place_id = a.city_place_id) desc,
            count(*) desc
   limit 1;
$$;

revoke execute on function public.ville_monuments_a_classer() from public, anon, authenticated;
grant execute on function public.ville_monuments_a_classer() to service_role;

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

  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select * into v_profile from public.profiles where id = p_user;
  if not found or coalesce(v_profile.city_place_id, v_profile.city) is null then
    return null;
  end if;

  v_today := (now() at time zone coalesce(v_profile.timezone, 'UTC'))::date;

  -- Déjà servie aujourd'hui : la même, qu'elle vienne de la ville ou d'une
  -- voisine. Une anecdote d'une ville quittée depuis ne compte plus.
  select a.* into v_anecdote
    from public.user_anecdote_history h
    join public.anecdotes a on a.id = h.anecdote_id
   where h.user_id = p_user
     and h.sent_on = v_today
     and (
       case
         when v_profile.city_place_id is not null
           then a.city_place_id = v_profile.city_place_id
         else a.city = v_profile.city
       end
       or (
         coalesce(v_profile.villes_voisines, false)
         and a.city_place_id in (
           select v.voisin_place_id from public.villes_voisines v
            where v.place_id = v_profile.city_place_id
         )
       )
     )
   order by h.sent_at desc
   limit 1;

  if found then
    return v_anecdote;
  end if;

  -- Sa ville, toujours en premier. Un monument servi ces 20 derniers jours
  -- passe après tout le reste.
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
   order by public.monument_recent(p_user, a.city_place_id, a.monument, v_today),
            a.reuse_count, random()
   limit 1;

  -- Rien de neuf chez lui, et il a dit oui : la voisine la plus proche qui a
  -- encore quelque chose à lui apprendre.
  if not found and coalesce(v_profile.villes_voisines, false) and v_profile.city_place_id is not null then
    select a.* into v_anecdote
      from public.villes_voisines v
      join public.anecdotes a on a.city_place_id = v.voisin_place_id
     where v.place_id = v_profile.city_place_id
       and a.status = 'validated'
       and not exists (
         select 1 from public.user_anecdote_history h
          where h.user_id = p_user and h.anecdote_id = a.id
       )
     order by v.rang,
              public.monument_recent(p_user, a.city_place_id, a.monument, v_today),
              a.reuse_count, random()
     limit 1;
  end if;

  if v_anecdote.id is null then
    return null;
  end if;

  insert into public.user_anecdote_history (user_id, anecdote_id, sent_on)
  values (p_user, v_anecdote.id, v_today)
  on conflict (user_id, anecdote_id) do nothing;

  update public.anecdotes set reuse_count = reuse_count + 1 where id = v_anecdote.id;
  v_anecdote.reuse_count := v_anecdote.reuse_count + 1;
  return v_anecdote;
end;
$$;

-- Vrai si ce lecteur a reçu une anecdote sur ce monument ces 20 derniers jours.
create or replace function public.monument_recent(p_user uuid, p_place_id text, p_monument text, p_today date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_monument is not null and exists (
    select 1
      from public.user_anecdote_history h
      join public.anecdotes a on a.id = h.anecdote_id
     where h.user_id = p_user
       and h.sent_on > p_today - 20
       and a.city_place_id = p_place_id
       and a.monument = p_monument
  );
$$;

revoke execute on function public.monument_recent(uuid, text, text, date) from public, anon, authenticated;

-- Classer les anecdotes nouvelles chaque matin, après la production de 5 h,
-- une ville par appel. Rien à classer : pas d'appel.
create or replace function public.classer_monuments()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  if public.ville_monuments_a_classer() is null then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'anecto_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'anecto_admin_secret';
  if v_url is null or v_secret is null then
    raise exception 'Secrets anecto_functions_url / anecto_admin_secret absents de Vault';
  end if;

  return net.http_post(
    url := v_url || '/monuments',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-anecto-admin-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function public.classer_monuments() from public, anon, authenticated;

select cron.unschedule('anecto-monuments')
 where exists (select 1 from cron.job where jobname = 'anecto-monuments');
select cron.schedule('anecto-monuments', '*/10 6-7 * * *', $$select public.classer_monuments()$$);
