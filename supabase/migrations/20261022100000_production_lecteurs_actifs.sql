-- Ne produire que pour les lecteurs actifs.
--
-- Le 22 octobre : egiastudio n'avait rien lu depuis des semaines (46
-- anecdotes en attente), et le réassort comme les voisines produisaient
-- encore pour son compte. Des crédits DeepSeek dépensés pour personne.
--
-- Les règles, fixées le 22 octobre :
--
--   1. Un lecteur est actif s'il a lu une anecdote ces quatorze derniers
--      jours, ou si son compte a moins de quatorze jours.
--   2. Le réassort de 5 h et la production des voisines ne regardent que les
--      lecteurs actifs. Les demandes de ville nouvelle ne changent pas : la
--      demande est déjà un signe d'intérêt.
--   3. Le rapport ne signale le stock bas que des lecteurs actifs.
--
-- Un lecteur qui revient retrouve ses anecdotes en attente ; sa première
-- lecture le rend actif, et la production reprend pour lui.

create or replace function public.lecteur_actif(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.user_anecdote_history h
            where h.user_id = p_user and h.read_at > now() - interval '14 days'
         )
      or exists (
           select 1 from public.profiles p
            where p.id = p_user and p.created_at > now() - interval '14 days'
         );
$$;

revoke execute on function public.lecteur_actif(uuid) from public, anon, authenticated;

-- 2. Le réassort.
create or replace function public.villes_en_stock_bas(p_seuil int default 3, p_limit int default 6)
returns table (ville text, place_id text, restantes int)
language sql
stable
security definer
set search_path = public
as $$
  with restants as (
    select p.city_place_id as place_id,
           p.city as ville,
           (select count(*)
              from public.anecdotes a
             where a.status = 'validated'
               and a.city_place_id = p.city_place_id
               and not exists (
                 select 1 from public.user_anecdote_history h
                  where h.user_id = p.id and h.anecdote_id = a.id
               ))::int as restantes
      from public.profiles p
     where p.city_place_id is not null
       and public.lecteur_actif(p.id)
  ),
  villes as (
    select r.place_id, min(r.ville) as ville, min(r.restantes) as restantes
      from restants r
     group by r.place_id
    having min(r.restantes) <= p_seuil
  )
  select v.ville, v.place_id, v.restantes
    from villes v
    cross join lateral (
      select count(*) filter (where a.status = 'draft' and not a.a_relire)::int as brouillons,
             max(a.created_at) as derniere
        from public.anecdotes a
       where a.city_place_id = v.place_id
    ) stock
   where stock.brouillons = 0
     and (stock.derniere is null or stock.derniere < now() - interval '20 hours')
     and not exists (
       select 1 from public.lots_generation l
        where l.city_place_id = v.place_id
          and l.mode = 'generation'
          and l.created_at > now() - interval '20 hours'
     )
     and not exists (
       select 1 from public.sujets_anecdote s
        where s.city_place_id = v.place_id and s.statut in ('a_rediger', 'en_cours')
     )
     and not public.ville_epuisee(v.place_id)
   order by v.restantes, v.ville
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.villes_en_stock_bas(int, int) from public, anon, authenticated;

-- 2 bis. Les voisines.
create or replace function public.voisines_a_produire(p_limit int default 2)
returns table (ville text, place_id text)
language sql
stable
security definer
set search_path = public
as $$
  with lecteurs as (
    select p.id, p.city_place_id
      from public.profiles p
     where p.villes_voisines
       and p.city_place_id is not null
       and public.lecteur_actif(p.id)
       and (select count(*)
              from public.anecdotes a
             where a.status = 'validated'
               and a.city_place_id = p.city_place_id
               and not exists (
                 select 1 from public.user_anecdote_history h
                  where h.user_id = p.id and h.anecdote_id = a.id
               )) <= 3
  ),
  choix as (
    select distinct on (l.id) v.voisin_place_id, v.voisin_ville, v.rang
      from lecteurs l
      join public.villes_voisines v on v.place_id = l.city_place_id
     where (select count(*)
              from public.anecdotes a
             where a.status = 'validated'
               and a.city_place_id = v.voisin_place_id
               and not exists (
                 select 1 from public.user_anecdote_history h
                  where h.user_id = l.id and h.anecdote_id = a.id
               )) < 5
       and not exists (
             select 1 from public.lots_generation lg
              where lg.city_place_id = v.voisin_place_id
                and lg.mode = 'generation'
                and lg.creees = 0
                and lg.created_at between now() - interval '14 days' and now() - interval '20 hours'
           )
     order by l.id, v.rang
  )
  select min(c.voisin_ville), c.voisin_place_id
    from choix c
   where not exists (
           select 1 from public.lots_generation lg
            where lg.city_place_id = c.voisin_place_id
              and lg.mode = 'generation'
              and lg.created_at > now() - interval '20 hours'
         )
     and not exists (
           select 1 from public.anecdotes a
            where a.city_place_id = c.voisin_place_id and a.status = 'draft'
         )
     and not exists (
           select 1 from public.sujets_anecdote s
            where s.city_place_id = c.voisin_place_id and s.statut in ('a_rediger', 'en_cours')
         )
   group by c.voisin_place_id
   order by min(c.rang)
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.voisines_a_produire(int) from public, anon, authenticated;

-- 3. Le rapport.
create or replace function public.rapport_quotidien()
 returns table(jour date, lecteurs integer, anecdotes_lues integer, lecteurs_7j integer, profils integer, nouveaux_profils integer, villes_ouvertes integer, anecdotes_validees integer, brouillons integer, demandes_en_attente integer, stocks_bas jsonb, adores integer, adores_detail jsonb, nouvelles_demandes jsonb, villes_pretes jsonb)
 language sql
 security definer
 set search_path to 'public'
as $function$
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
               and (
                 case
                   when p.city_place_id is not null then a.city_place_id = p.city_place_id
                   else a.city = p.city
                 end
                 or (
                   coalesce(p.villes_voisines, false)
                   and a.city_place_id in (
                     select v.voisin_place_id from public.villes_voisines v
                      where v.place_id = p.city_place_id
                   )
                 )
               )
               and not exists (
                 select 1 from public.user_anecdote_history h
                  where h.user_id = p.id and h.anecdote_id = a.id
               ))::int as restantes
      from public.profiles p
     where coalesce(p.city_place_id, p.city) is not null
       and public.lecteur_actif(p.id)
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
$function$;
