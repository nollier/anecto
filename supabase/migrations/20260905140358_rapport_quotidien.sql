-- Le rapport du matin.
--
-- Douze profils, vingt-et-une villes, cinq cent soixante-six anecdotes : rien
-- de tout cela ne se voit sans ouvrir le tableau de bord, et ce qui ne se voit
-- pas ne se corrige pas. Deux chiffres décident pourtant chaque semaine :
-- combien de gens ont lu hier, et qui est sur le point de manquer de matière.
--
-- Le second est le plus urgent. Un lecteur qui épuise sa ville reçoit « Rien à
-- lire aujourd'hui » : il ne revient pas le lendemain. Prévenu trois anecdotes
-- avant, on a le temps de produire.

create or replace function public.rapport_quotidien()
returns table (
  jour date,
  lecteurs int,
  anecdotes_lues int,
  lecteurs_7j int,
  profils int,
  nouveaux_profils int,
  villes_ouvertes int,
  anecdotes_validees int,
  brouillons int,
  demandes_en_attente int,
  stocks_bas jsonb
)
language sql
security definer
set search_path = public
as $$
  -- Une journée se juge à Paris, pas en UTC : sinon les lectures de 23 h
  -- comptent pour le lendemain et le rapport du matin décrit deux demi-jours.
  with bornes as (
    select ((now() at time zone 'Europe/Paris')::date - 1) as hier
  ),
  lectures as (
    select h.user_id, h.anecdote_id
      from public.user_anecdote_history h, bornes b
     where h.read_at is not null
       and (h.read_at at time zone 'Europe/Paris')::date = b.hier
  ),
  -- Ce qui reste à lire à chacun, dans sa ville : les anecdotes validées qui
  -- ne sont jamais passées dans son historique. Ni reçues, ni lues, ni
  -- ignorées — pas encore arrivées.
  restants as (
    select p.id,
           p.city,
           (select count(*)
              from public.anecdotes a
             where a.status = 'validated'
               and case
                     when p.city_place_id is not null then a.city_place_id = p.city_place_id
                     else a.city = p.city
                   end
               and not exists (
                 select 1 from public.user_anecdote_history h
                  where h.user_id = p.id and h.anecdote_id = a.id
               ))::int as restantes
      from public.profiles p
     where coalesce(p.city_place_id, p.city) is not null
  )
  select
    (select hier from bornes),
    (select count(distinct user_id)::int from lectures),
    (select count(*)::int from lectures),
    (select count(distinct h.user_id)::int
       from public.user_anecdote_history h
      where h.read_at >= now() - interval '7 days'),
    (select count(*)::int from public.profiles),
    (select count(*)::int from public.profiles p, bornes b
      where (p.created_at at time zone 'Europe/Paris')::date = b.hier),
    (select count(distinct a.city_place_id)::int
       from public.anecdotes a where a.status = 'validated' and a.city_place_id is not null),
    (select count(*)::int from public.anecdotes where status = 'validated'),
    (select count(*)::int from public.anecdotes where status = 'draft'),
    (select count(*)::int from public.demandes_ville where notified_at is null),
    coalesce(
      (select jsonb_agg(jsonb_build_object('email', u.email, 'ville', r.city, 'restantes', r.restantes)
                        order by r.restantes, r.city)
         from restants r
         join auth.users u on u.id = r.id
        where r.restantes <= 3),
      '[]'::jsonb
    );
$$;

revoke execute on function public.rapport_quotidien() from public, anon, authenticated;
grant execute on function public.rapport_quotidien() to service_role;

-- Le déclencheur, sur le modèle des trois autres.
create or replace function public.declencher_rapport_quotidien()
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
           url := v_url || '/rapport-quotidien',
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

revoke execute on function public.declencher_rapport_quotidien() from public, anon, authenticated;

-- 6 h UTC, soit 8 h à Paris l'été et 7 h l'hiver : le rapport porte sur une
-- journée close, et il arrive avant l'alerte aux lecteurs de 8 h 30.
select cron.unschedule('anecto-rapport-quotidien')
 where exists (select 1 from cron.job where jobname = 'anecto-rapport-quotidien');

select cron.schedule(
  'anecto-rapport-quotidien',
  '0 6 * * *',
  $$select public.declencher_rapport_quotidien()$$
);
