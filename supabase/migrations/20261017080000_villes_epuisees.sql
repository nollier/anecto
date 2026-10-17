-- Les villes épuisées.
--
-- Du 15 au 17 octobre, le réassort de 5 h a relancé Saint-Jean-de-Luz chaque
-- matin : 10 demandées, 0 créées. Ses 45 articles sont exploités, 13 autres
-- ont été lus sans résultat ; il n'y avait plus rien à rédiger. Le rapport
-- l'affichait en ⚠ comme un lot raté, alors que la ville était simplement
-- épuisée.
--
-- Les règles, fixées le 17 octobre :
--
--   1. Une ville est épuisée quand ses trois derniers lots n'ont rien créé.
--   2. Le réassort la laisse en paix sept jours après son dernier lot, puis
--      retente une fois : Wikipédia s'enrichit, les documents lus sans
--      résultat ressortent au bout de trente jours (`sources_steriles`).
--   3. Ses voisines sont calculées tout de suite, sans attendre qu'un
--      lecteur dise oui : une douzaine d'appels Google, une fois pour toutes,
--      pour que la voisine soit prête à produire le jour où il accepte.
--   4. Le rapport la nomme « épuisée », pas « en défaut ».

-- 1. Une ville épuisée.
create or replace function public.ville_epuisee(p_place_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with derniers as (
    select l.creees, l.created_at
      from public.lots_generation l
     where l.city_place_id = p_place_id
       and l.mode = 'generation'
     order by l.created_at desc
     limit 3
  )
  select count(*) = 3
         and bool_and(d.creees = 0)
         and max(d.created_at) > now() - interval '7 days'
    from derniers d;
$$;

revoke execute on function public.ville_epuisee(text) from public, anon, authenticated;

-- 2. Le réassort saute les villes épuisées.
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

-- 3. Les voisines d'une ville épuisée sont calculées sans attendre le oui.
create or replace function public.voisines_a_calculer(p_limit int default 5)
returns table (place_id text, ville text)
language sql
stable
security definer
set search_path = public
as $$
  select p.city_place_id, min(p.city)
    from public.profiles p
    left join public.villes_geo g on g.place_id = p.city_place_id
   where (p.villes_voisines or public.ville_epuisee(p.city_place_id))
     and p.city_place_id is not null
     -- Une tentative par jour au plus : une ville sans voisine (une île)
     -- ne doit pas coûter un appel Google toutes les heures.
     and (g.voisines_calculees_at is null or (
           g.voisines_calculees_at < now() - interval '1 day'
           and not exists (select 1 from public.villes_voisines v where v.place_id = p.city_place_id)
         ))
   group by p.city_place_id
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.voisines_a_calculer(int) from public, anon, authenticated;
grant execute on function public.voisines_a_calculer(int) to service_role;

-- 4. Le rapport : un lot vide faute de source est marqué épuisé, et les
-- villes en pause sont nommées, avec le jour où le réassort les retentera.
create or replace function public.controle_production()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ville', l.city,
               'demandees', l.demandees,
               'creees', l.creees,
               'publiables', l.publiables,
               'en_attente', (select count(*)::int from public.sujets_anecdote s
                               where s.lot_id = l.id and s.statut in ('a_rediger', 'en_cours')),
               'planifications', l.planifications,
               'erreur', l.erreur,
               'sautees', l.sautees,
               'epuisee', l.creees = 0
                          and l.erreur is null
                          and exists (
                            select 1 from jsonb_array_elements_text(coalesce(l.sautees, '[]'::jsonb)) t
                             where t like 'Aucune source neuve%'
                                or t like 'Dossier épuisé%'
                          )
             ) order by l.created_at)
        from public.lots_generation l
       where l.mode = 'generation'
         and l.created_at >= now() - interval '24 hours'
    ), '[]'::jsonb),
    'epuisees', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ville', v.ville,
               'reprise', ((v.dernier + interval '7 days') at time zone 'Europe/Paris')::date
             ) order by v.ville)
        from (
          select p.city_place_id, min(p.city) as ville,
                 (select max(l.created_at) from public.lots_generation l
                   where l.city_place_id = p.city_place_id and l.mode = 'generation') as dernier
            from public.profiles p
           where p.city_place_id is not null
             and public.ville_epuisee(p.city_place_id)
           group by p.city_place_id
        ) v
    ), '[]'::jsonb),
    'corrigees', (
      select count(*)::int from public.corrections_anecdote c
       where c.issue = 'publiable' and c.created_at >= now() - interval '24 hours'
    ),
    'abandonnees', coalesce((
      select jsonb_agg(jsonb_build_object('ville', a.city, 'titre', a.title, 'motif', c.motif)
                       order by c.created_at)
        from public.corrections_anecdote c
        join public.anecdotes a on a.id = c.anecdote_id
       where c.issue = 'abandonnee' and c.created_at >= now() - interval '24 hours'
    ), '[]'::jsonb),
    'en_correction', (
      select count(*)::int from public.anecdotes a
       where a.status = 'draft'
         and not public.est_publiable(a.verdict, a.confidence, a.qualite_ok)
         and a.corrections < 3
    )
  );
$$;

revoke execute on function public.controle_production() from public, anon, authenticated;
grant execute on function public.controle_production() to service_role;
