-- Le travail est-il fait, et bien fait ?
--
-- Le 29 septembre, le réassort a demandé dix anecdotes pour Lille et dix pour
-- Saint-Chamond. Il en est sorti trois et deux. Les sept et huit autres ont
-- été écartées pour des raisons que `generate-anecdote` renvoyait dans sa
-- réponse HTTP, que personne ne lit. Et les deux brouillons en `doute` sont
-- restés en attente : tant qu'ils y sont, `villes_en_stock_bas` ne relance
-- rien. Le rapport du 30 a donc signalé le même stock bas, sans explication.
--
-- Trois règles :
--
--   1. Chaque appel de production laisse une ligne dans `lots_generation` :
--      demandé, obtenu, publiable, et la raison de chaque anecdote écartée.
--   2. Publiable = verdict `confirme`, confiance `haute`, rédaction conforme
--      (`qualite_ok`, contrôlé par `qualite.ts`) et aucune faute relevée.
--      `valider_automatiquement` ne publie rien d'autre.
--   3. Un brouillon non publiable n'attend plus un humain : toutes les quinze
--      minutes, `corriger_brouillons` le renvoie au modèle avec la liste
--      exacte de ce qui ne va pas, puis tout est recontrôlé. Trois
--      tentatives ; au-delà, rejet motivé dans `rejets_anecdote`, ce qui
--      libère la ville pour un lot neuf.

-- 1. Colonnes de contrôle.
alter table public.anecdotes
  add column if not exists qualite_ok boolean,
  add column if not exists qualite_problemes jsonb,
  -- Tout ce qui empêche la publication, tel qu'on le redonne au modèle.
  add column if not exists problemes jsonb,
  add column if not exists corrections int not null default 0;

-- Existe en base depuis le 5 septembre (`journal_des_rejets`), jamais versée
-- au dépôt : on l'y décrit, sans rien changer à ce qui existe.
create table if not exists public.rejets_anecdote (
  id uuid primary key default gen_random_uuid(),
  city text,
  city_place_id text,
  titre text,
  motif text,
  created_at timestamptz not null default now()
);
alter table public.rejets_anecdote enable row level security;

-- 2. Journal des lots.
create table if not exists public.lots_generation (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  mode text not null check (mode in ('generation', 'correction')),
  city text,
  city_place_id text,
  axe text,
  demandees int not null default 0,
  creees int not null default 0,
  publiables int not null default 0,
  sautees jsonb not null default '[]'::jsonb,
  erreur text,
  duree_ms int
);
alter table public.lots_generation enable row level security;
create index if not exists lots_generation_created_at on public.lots_generation (created_at desc);

create table if not exists public.corrections_anecdote (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  anecdote_id uuid not null references public.anecdotes (id) on delete cascade,
  tentative int not null,
  issue text not null check (issue in ('publiable', 'a_reprendre', 'abandonnee', 'echec')),
  motif text,
  avant jsonb,
  apres jsonb
);
alter table public.corrections_anecdote enable row level security;
create index if not exists corrections_anecdote_anecdote on public.corrections_anecdote (anecdote_id);

-- 3. La règle de publication, en un seul endroit.
create or replace function public.est_publiable(p_verdict text, p_confiance text, p_qualite_ok boolean)
returns boolean
language sql
immutable
as $$
  select coalesce(p_verdict = 'confirme' and p_confiance = 'haute' and p_qualite_ok, false);
$$;

create or replace function public.valider_automatiquement(p_limit int default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_validees int;
begin
  update public.anecdotes
     set status = 'validated'
   where id in (
     select a.id
       from public.anecdotes a
      where a.status = 'draft'
        and public.est_publiable(a.verdict, a.confidence, a.qualite_ok)
      order by a.created_at
      limit greatest(p_limit, 1)
   );

  get diagnostics v_validees = row_count;
  return v_validees;
end;
$$;

revoke execute on function public.valider_automatiquement(int) from public, anon, authenticated;

-- 4. La boucle de correction.
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
     and not public.est_publiable(a.verdict, a.confidence, a.qualite_ok)
     and a.corrections < 3
     -- Laisse à la génération le temps de finir son lot.
     and a.created_at < now() - interval '5 minutes'
   order by a.corrections, a.created_at
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.brouillons_a_corriger(int) from public, anon, authenticated;
grant execute on function public.brouillons_a_corriger(int) to service_role;

create or replace function public.corriger_brouillons(p_limit int default 2)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Rien à corriger : pas d'appel, pas de coût.
  if not exists (select 1 from public.brouillons_a_corriger(1)) then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'anecto_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'anecto_admin_secret';

  if v_url is null or v_secret is null then
    raise exception 'Secrets anecto_functions_url / anecto_admin_secret absents de Vault';
  end if;

  return net.http_post(
    url := v_url || '/generate-anecdote',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-anecto-admin-secret', v_secret
    ),
    body := jsonb_build_object('mode', 'corriger', 'limit', p_limit),
    timeout_milliseconds := 300000
  );
end;
$$;

revoke execute on function public.corriger_brouillons(int) from public, anon, authenticated;

-- Décalé de la validation (0, 15, 30, 45) : une anecdote corrigée est
-- publiée au passage suivant.
select cron.unschedule('anecto-correction-brouillons')
 where exists (select 1 from cron.job where jobname = 'anecto-correction-brouillons');

select cron.schedule(
  'anecto-correction-brouillons',
  '5,20,35,50 * * * *',
  $$select public.corriger_brouillons(2)$$
);

-- 5. Ce que le rapport du matin en dit : les dernières vingt-quatre heures.
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
               'erreur', l.erreur,
               'sautees', l.sautees
             ) order by l.created_at)
        from public.lots_generation l
       where l.mode = 'generation'
         and l.created_at >= now() - interval '24 hours'
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
