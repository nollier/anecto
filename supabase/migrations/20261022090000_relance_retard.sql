-- Relance par email après cinq anecdotes non lues.
--
-- Règles, fixées le 22 octobre :
--
--   1. Un lecteur est en retard quand ses cinq dernières anecdotes servies
--      n'ont pas été ouvertes (`read_at` vide).
--   2. Une relance par retard : il faut une lecture postérieure à la
--      précédente relance pour qu'un nouveau retard en déclenche une autre.
--   3. Seulement les comptes qui ont une adresse email.

alter table public.profiles
  add column if not exists relance_retard_at timestamptz;

create or replace function public.relances_a_envoyer(p_limit int default 100)
returns table (user_id uuid, email text, ville text, en_attente int)
language sql
stable
security definer
set search_path = public
as $$
  with serie as (
    -- Les anecdotes non lues depuis la dernière lecture : la série en cours.
    select h.user_id, count(*)::int as non_lues
      from public.user_anecdote_history h
     where h.read_at is null
       and h.sent_at > coalesce(
             (select max(h2.sent_at) from public.user_anecdote_history h2
               where h2.user_id = h.user_id and h2.read_at is not null),
             '-infinity'::timestamptz
           )
     group by h.user_id
  )
  select p.id, u.email::text, p.city, s.non_lues
    from serie s
    join public.profiles p on p.id = s.user_id
    join auth.users u on u.id = p.id
   where s.non_lues >= 5
     and u.email is not null
     and p.city is not null
     and (
       p.relance_retard_at is null
       or exists (
         select 1 from public.user_anecdote_history h
          where h.user_id = p.id and h.read_at > p.relance_retard_at
       )
     )
   order by s.non_lues desc
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.relances_a_envoyer(int) from public, anon, authenticated;
grant execute on function public.relances_a_envoyer(int) to service_role;

create or replace function public.declencher_relances_retard()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Personne à relancer : pas d'appel.
  if not exists (select 1 from public.relances_a_envoyer(1)) then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'anecto_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'anecto_admin_secret';
  if v_url is null or v_secret is null then
    raise exception 'Secrets anecto_functions_url / anecto_admin_secret absents de Vault';
  end if;

  return net.http_post(
    url := v_url || '/relance-retard',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-anecto-admin-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.declencher_relances_retard() from public, anon, authenticated;

-- Une fois par jour, en fin de matinée (heure de Paris en été : 10 h 23).
select cron.unschedule('anecto-relances-retard')
 where exists (select 1 from cron.job where jobname = 'anecto-relances-retard');
select cron.schedule('anecto-relances-retard', '23 8 * * *', $$select public.declencher_relances_retard()$$);
