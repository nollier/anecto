-- Ce que coûte DeepSeek, et ce que le contrôle ne sait pas trancher.
--
-- Le 10 octobre, deux constats :
--
--   1. On ne savait pas ce que coûtait une journée de production : aucun appel
--      DeepSeek n'était compté. Chaque réponse porte pourtant son décompte de
--      jetons. `generate-anecdote` l'écrit désormais dans `deepseek_appels`,
--      et le rapport du matin relève le solde du compte dans
--      `soldes_deepseek` : la différence d'un jour à l'autre est la dépense
--      réelle, au tarif réel, sans table de prix à tenir.
--   2. Deux anecdotes sur six ont été rejetées la veille sur le seul doute du
--      vérificateur, dont une pour une date que le dossier donnait lui-même.
--      Ce cas-là n'est plus un rejet : l'anecdote attend une relecture
--      humaine (`a_relire`), qui la publie ou la rejette depuis un lien du
--      rapport (fonction `relecture`).

-- 1. Les appels DeepSeek.
create table if not exists public.deepseek_appels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  etape text not null,
  ville text,
  modele text,
  jetons_entree int not null default 0,
  jetons_cache int not null default 0,
  jetons_sortie int not null default 0
);
alter table public.deepseek_appels enable row level security;
create index if not exists deepseek_appels_created_at on public.deepseek_appels (created_at desc);

create table if not exists public.soldes_deepseek (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  devise text not null,
  solde numeric not null
);
alter table public.soldes_deepseek enable row level security;
create index if not exists soldes_deepseek_created_at on public.soldes_deepseek (created_at desc);

-- 2. La relecture humaine.
alter table public.anecdotes
  add column if not exists a_relire boolean not null default false;

alter table public.corrections_anecdote drop constraint if exists corrections_anecdote_issue_check;
alter table public.corrections_anecdote
  add constraint corrections_anecdote_issue_check
  check (issue in ('publiable', 'a_reprendre', 'abandonnee', 'echec', 'a_relire'));

-- Un brouillon en relecture n'est plus corrigé : trois passes n'ont pas
-- convaincu le vérificateur, une quatrième coûterait sans rien trancher.
create or replace function public.brouillons_a_corriger(p_limit int default 2)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select a.id
    from public.anecdotes a
   where a.status = 'draft'
     and not a.a_relire
     and not public.est_publiable(a.verdict, a.confidence, a.qualite_ok)
     and a.corrections < 3
     -- Laisse à la génération le temps de finir son lot.
     and a.created_at < now() - interval '5 minutes'
   order by a.corrections, a.created_at
   limit greatest(p_limit, 1);
$$;

-- Un brouillon en relecture ne bloque pas le réassort de sa ville : il attend
-- un humain, pas la production.
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
   order by v.restantes, v.ville
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.villes_en_stock_bas(int, int) from public, anon, authenticated;

-- 3. Ce que le rapport en dit : consommation de la veille, anecdotes à
-- relire, nouveaux comptes.
create or replace function public.suivi_quotidien()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'deepseek', (
      select jsonb_build_object(
               'appels', count(*)::int,
               'jetons_entree', coalesce(sum(d.jetons_entree), 0)::bigint,
               'jetons_cache', coalesce(sum(d.jetons_cache), 0)::bigint,
               'jetons_sortie', coalesce(sum(d.jetons_sortie), 0)::bigint,
               'par_etape', coalesce((
                 select jsonb_agg(jsonb_build_object('etape', e.etape, 'appels', e.n, 'jetons', e.jetons)
                                  order by e.jetons desc)
                   from (
                     select etape, count(*)::int as n,
                            sum(jetons_entree + jetons_sortie)::bigint as jetons
                       from public.deepseek_appels
                      where created_at >= now() - interval '24 hours'
                      group by etape
                   ) e
               ), '[]'::jsonb)
             )
        from public.deepseek_appels d
       where d.created_at >= now() - interval '24 hours'
    ),
    'a_relire', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'ville', a.city, 'titre', a.title)
                       order by a.created_at)
        from public.anecdotes a
       where a.status = 'draft' and a.a_relire
    ), '[]'::jsonb),
    'nouveaux_comptes', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'ville', p.city) order by u.created_at)
        from auth.users u
        left join public.profiles p on p.id = u.id
       where u.created_at >= now() - interval '24 hours'
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.suivi_quotidien() from public, anon, authenticated;
grant execute on function public.suivi_quotidien() to service_role;
