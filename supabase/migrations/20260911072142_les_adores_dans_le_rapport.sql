-- Appliquée en base le 11 septembre, versée au dépôt le 30 septembre à partir
-- de l'historique des migrations (`supabase_migrations.schema_migrations`).
--
-- Les « J'adore » de la veille dans le rapport quotidien. Remplace la version
-- du 5 septembre (`journal_des_rejets`) : les listes `creees` et `rejets`
-- disparaissent du rapport.

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
  with bornes as (
    select ((now() at time zone 'Europe/Paris')::date - 1) as hier
  ),
  lectures as (
    select h.user_id, h.anecdote_id
      from public.user_anecdote_history h, bornes b
     where h.read_at is not null
       and (h.read_at at time zone 'Europe/Paris')::date = b.hier
  ),
  adores_hier as (
    select f.anecdote_id, count(*)::int as combien
      from public.feedback f, bornes b
     where f.type = 'adore'
       and (f.created_at at time zone 'Europe/Paris')::date = b.hier
     group by f.anecdote_id
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
