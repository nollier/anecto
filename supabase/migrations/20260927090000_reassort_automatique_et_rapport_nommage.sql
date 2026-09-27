-- Réassort automatique des villes déjà ouvertes, et le rapport qui les nomme.
--
-- `produire_lot` existe depuis les premières villes, mais n'a jamais été
-- planifiée : le rapport se contentait d'imprimer la commande à lancer à la
-- main dès qu'un lecteur approchait de la fin de sa ville. Comme pour les
-- villes demandées (`produire_villes_demandees`, planifiée depuis le 5
-- septembre), l'écart avec la cible ne demande aucun jugement humain — seul
-- le déclenchement manquait.
--
-- Une fois par jour, avant le rapport de 6 h : le temps qu'une génération se
-- termine (jusqu'à soixante appels DeepSeek) et que la validation
-- automatique, qui tourne toutes les quinze minutes, rattrape le lot.
select cron.unschedule('anecto-reassort-stock-bas')
 where exists (select 1 from cron.job where jobname = 'anecto-reassort-stock-bas');

select cron.schedule(
  'anecto-reassort-stock-bas',
  '0 5 * * *',
  $$select public.produire_lot(6, 30)$$
);

-- Le rapport nommait jusqu'ici un compte, jamais une ville : « 2 demandes de
-- ville en attente » n'indique pas si c'est Vannes ou Biarritz, et « ta ville
-- est prête » partait déjà au bon moment sans que ça se voie ici. Deux champs
-- de plus, bornés à la même journée que le reste du rapport.
drop function if exists public.rapport_quotidien();

create function public.rapport_quotidien()
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
  stocks_bas jsonb,
  nouvelles_demandes jsonb,
  villes_pretes jsonb
)
language sql
security definer
set search_path = public
as $$
  with bornes as (
    select ((now() at time zone 'Europe/Paris')::date - 1) as hier
  ),
  lectures as (
    select h.user_id, h.anecdote_id
      from public.user_anecdote_history h, bornes b
     where h.read_at is not null
       and (h.read_at at time zone 'Europe/Paris')::date = b.hier
  ),
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
    ),
    -- Demandées hier : ce que la production automatique a déjà pris en charge
    -- pendant la nuit, avant que quiconque ouvre le tableau de bord.
    coalesce(
      (select jsonb_agg(jsonb_build_object('ville', d.ville, 'email', u.email) order by d.ville)
         from public.demandes_ville d
         join auth.users u on u.id = d.user_id
         cross join bornes b
        where (d.created_at at time zone 'Europe/Paris')::date = b.hier),
      '[]'::jsonb
    ),
    -- Prévenues hier : le mail « ta ville est prête » est déjà parti tout
    -- seul, ceci ne fait que le rendre visible ici aussi.
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                 'ville', t.ville,
                 'anecdotes', t.anecdotes,
                 'prevenus', t.prevenus
               ) order by t.ville)
         from (
           select min(d.ville) as ville,
                  count(distinct d.id)::int as prevenus,
                  max(stock.validees)::int as anecdotes
             from public.demandes_ville d
             cross join bornes b
             cross join lateral (
               select count(*)::int as validees
                 from public.anecdotes a
                where a.city_place_id = d.place_id and a.status = 'validated'
             ) stock
            where d.notified_at is not null
              and (d.notified_at at time zone 'Europe/Paris')::date = b.hier
            group by d.place_id
         ) t
      ),
      '[]'::jsonb
    );
$$;

revoke execute on function public.rapport_quotidien() from public, anon, authenticated;
grant execute on function public.rapport_quotidien() to service_role;
