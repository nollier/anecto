-- Garder trace de ce qui a été refusé, et pourquoi.
--
-- Une anecdote écartée n'existait nulle part : citations introuvables, verdict
-- réfuté, dossier trop maigre, le motif ne vivait que dans la réponse HTTP et
-- les journaux de la fonction, que personne ne lit. On payait donc une
-- génération sur deux sans jamais savoir ce qui clochait, ni pouvoir corriger
-- le prompt autrement qu'au jugé.
--
-- Table à part plutôt qu'un `status = 'rejected'` sur `anecdotes` : un
-- candidat refusé n'a souvent pas de corps exploitable, et la table des
-- anecdotes impose un texte de 50 à 3000 caractères.

create table if not exists public.rejets_anecdote (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  city_place_id text,
  -- Le titre quand le modèle a été jusqu'à en produire un. Null quand le rejet
  -- est intervenu avant, faute de matière.
  titre text,
  motif text not null,
  created_at timestamptz not null default now()
);

create index if not exists rejets_anecdote_recents_idx
  on public.rejets_anecdote (created_at desc);

alter table public.rejets_anecdote enable row level security;

-- Aucune politique : c'est un journal d'exploitation, lisible par la clé de
-- service et le tableau de bord, jamais par l'application.
revoke all on public.rejets_anecdote from anon, authenticated;

comment on table public.rejets_anecdote is
  'Anecdotes écartées avant insertion, avec leur motif. Alimente le rapport quotidien.';

-- Le rapport reprend les deux listes.
--
-- Le type de retour change, et `create or replace` ne sait pas le faire.
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
  creees jsonb,
  rejets jsonb
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
    -- Ce qui a été écrit hier, et ce qu'il en est advenu. La barrière de
    -- publication se juge ici, une ligne par anecdote.
    coalesce(
      (select jsonb_agg(x order by x->>'ville', x->>'titre')
         from (
           select jsonb_build_object(
                    'ville', a.city,
                    'titre', a.title,
                    'statut', a.status,
                    'verdict', a.verdict,
                    'confiance', a.confidence
                  ) as x
             from public.anecdotes a, bornes b
            where (a.created_at at time zone 'Europe/Paris')::date = b.hier
            limit 40
         ) q),
      '[]'::jsonb
    ),
    -- Et ce qui a été refusé, avec le motif tel que la vérification l'a écrit.
    coalesce(
      (select jsonb_agg(y order by y->>'ville')
         from (
           select jsonb_build_object(
                    'ville', r.city,
                    'titre', r.titre,
                    'motif', left(r.motif, 400)
                  ) as y
             from public.rejets_anecdote r, bornes b
            where (r.created_at at time zone 'Europe/Paris')::date = b.hier
            limit 40
         ) q2),
      '[]'::jsonb
    );
$$;

revoke execute on function public.rapport_quotidien() from public, anon, authenticated;
grant execute on function public.rapport_quotidien() to service_role;
