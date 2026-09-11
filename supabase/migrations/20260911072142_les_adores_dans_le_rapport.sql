-- Les « J'adore » entrent dans le rapport du matin.
--
-- `feedback` compte vingt-sept réactions depuis le 22 août, et pas une n'a
-- jamais été lue. L'alerte retours les écarte volontairement — un « J'adore »
-- sans commentaire n'appelle pas de réponse et noierait les corrections — mais
-- personne n'a pris le relais : le seul signal positif que le lecteur sache
-- émettre tombait dans le vide.
--
-- Le compte seul dirait peu. C'est le titre qui vaut : savoir que trois
-- lecteurs ont aimé « Le pirate et le poète » et aucun les hôtels particuliers
-- oriente ce qu'on produit ensuite, ce qu'aucun autre chiffre du rapport ne
-- dit.
--
-- Recréée plutôt que remplacée : `create or replace function` refuse un
-- changement de type de retour.

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
  adores int,
  adores_detail jsonb
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
  -- Même borne que les lectures : une réaction se rattache à la journée où
  -- elle a été faite, pas à celle où l'anecdote a été servie.
  adores_hier as (
    select f.anecdote_id, count(*)::int as combien
      from public.feedback f, bornes b
     where f.type = 'adore'
       and (f.created_at at time zone 'Europe/Paris')::date = b.hier
     group by f.anecdote_id
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
    ),
    (select coalesce(sum(combien), 0)::int from adores_hier),
    coalesce(
      (select jsonb_agg(jsonb_build_object('ville', a.city, 'titre', a.title, 'combien', h.combien)
                        order by h.combien desc, a.city, a.title)
         from adores_hier h
         join public.anecdotes a on a.id = h.anecdote_id),
      '[]'::jsonb
    );
$$;

revoke execute on function public.rapport_quotidien() from public, anon, authenticated;
grant execute on function public.rapport_quotidien() to service_role;
