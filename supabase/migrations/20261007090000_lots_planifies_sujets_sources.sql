-- Un lot de dix rend dix anecdotes.
--
-- Le 7 octobre, le contrôle de production a relevé cinq lots de dix
-- (Saint-Chamond, Saint-Paul, Strasbourg, Saint-Jean-de-Luz, Lille) pour deux
-- anecdotes créées en tout. Chaque essai envoyait le dossier entier au modèle,
-- lui laissait choisir le sujet, puis le refusait (doublon, citation
-- introuvable, récit trop court) : le temps d'une Edge Function y passait
-- avant le troisième essai, et la ville attendait vingt heures.
--
-- Désormais :
--
--   1. `generate-anecdote` choisit d'abord les sujets, en un seul appel sur le
--      dossier, et ne garde que ceux dont la phrase source se retrouve mot
--      pour mot dans l'article désigné. Ils attendent dans `sujets_anecdote`,
--      avec le texte de cet article.
--   2. Chaque sujet est rédigé à partir de son seul article. Ce qu'un appel
--      n'a pas le temps d'écrire, le passage `poursuivre` l'écrit, toutes les
--      cinq minutes.
--   3. Un lot dont il manque des anecdotes (sujet raté, ou anecdote rejetée
--      après trois corrections) est replanifié pour ce qui manque, en
--      alternant patrimoine et personnalités. Trois plans au plus par lot :
--      au-delà, la ville n'a plus de matière et insister coûterait sans
--      rien rendre.

-- 1. Les sujets en attente.
alter table public.lots_generation
  add column if not exists planifications int not null default 0,
  add column if not exists sujets int not null default 0;

create table if not exists public.sujets_anecdote (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lot_id uuid references public.lots_generation (id) on delete cascade,
  city text not null,
  city_place_id text,
  axe text not null default 'patrimoine',
  sujet text not null,
  angle text not null,
  faits jsonb not null default '[]'::jsonb,
  -- La phrase de l'article qui établit le sujet, vérifiée à la planification.
  citation text not null,
  article text not null,
  url text not null,
  editeur text not null,
  origine text not null,
  -- Le texte de l'article tel qu'il a été lu : la rédaction s'y tient, sans
  -- relire Wikipédia ni payer une seconde fois le dossier.
  extrait text not null,
  statut text not null default 'a_rediger'
    check (statut in ('a_rediger', 'en_cours', 'redige', 'echoue')),
  tentatives int not null default 0,
  reserve_at timestamptz,
  anecdote_id uuid references public.anecdotes (id) on delete set null,
  publiable boolean,
  motif text
);
alter table public.sujets_anecdote enable row level security;
create index if not exists sujets_anecdote_statut on public.sujets_anecdote (statut, created_at);
create index if not exists sujets_anecdote_lot on public.sujets_anecdote (lot_id);
create index if not exists sujets_anecdote_ville on public.sujets_anecdote (city_place_id);

-- 2. Les compteurs du lot, recalculés depuis ses sujets : le lot s'écrit sur
-- plusieurs appels, aucun ne connaît le total.
create or replace function public.actualiser_lot(
  p_lot uuid,
  p_sautees jsonb default '[]'::jsonb,
  p_planification boolean default false
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.lots_generation l
     set planifications = l.planifications + case when p_planification then 1 else 0 end,
         sautees = l.sautees || coalesce(p_sautees, '[]'::jsonb),
         sujets = (select count(*) from public.sujets_anecdote s where s.lot_id = p_lot),
         creees = (select count(*) from public.sujets_anecdote s
                    where s.lot_id = p_lot and s.anecdote_id is not null),
         publiables = (select count(*) from public.sujets_anecdote s
                        where s.lot_id = p_lot and s.publiable)
   where l.id = p_lot;
$$;

revoke execute on function public.actualiser_lot(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.actualiser_lot(uuid, jsonb, boolean) to service_role;

-- 3. Réserver des sujets à rédiger. `skip locked` : deux appels simultanés
-- ne rédigent jamais le même sujet. Un sujet réservé depuis plus de dix
-- minutes a été abandonné en route (fonction coupée) : il redevient
-- disponible, deux fois au plus.
create or replace function public.reserver_sujets(p_limit int default 2, p_lot uuid default null)
returns setof public.sujets_anecdote
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sujets_anecdote
     set statut = 'echoue', motif = 'Rédaction interrompue deux fois.'
   where statut = 'en_cours'
     and reserve_at < now() - interval '10 minutes'
     and tentatives >= 2;

  return query
  update public.sujets_anecdote s
     set statut = 'en_cours', reserve_at = now(), tentatives = s.tentatives + 1
   where s.id in (
     select c.id
       from public.sujets_anecdote c
      where (c.statut = 'a_rediger'
             or (c.statut = 'en_cours' and c.reserve_at < now() - interval '10 minutes'))
        and c.tentatives < 2
        and (p_lot is null or c.lot_id = p_lot)
      order by c.created_at
      limit greatest(p_limit, 1)
      for update skip locked
   )
  returning s.*;
end;
$$;

revoke execute on function public.reserver_sujets(int, uuid) from public, anon, authenticated;
grant execute on function public.reserver_sujets(int, uuid) to service_role;

-- 4. Les lots restés sous leur cible. Compte ce qui est en vie : une
-- anecdote rejetée après trois corrections laisse un manque à combler.
create or replace function public.lots_a_completer(p_limit int default 1)
returns table (
  id uuid,
  city text,
  city_place_id text,
  axe text,
  planifications int,
  manque int
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.city, l.city_place_id, coalesce(l.axe, 'patrimoine'), l.planifications,
         (l.demandees - vivantes.n)::int
    from public.lots_generation l
    cross join lateral (
      select count(*)::int as n
        from public.sujets_anecdote s
        join public.anecdotes a on a.id = s.anecdote_id
       where s.lot_id = l.id and a.status <> 'rejected'
    ) vivantes
   where l.mode = 'generation'
     and l.city is not null
     and l.planifications between 1 and 2
     and l.created_at > now() - interval '3 days'
     and vivantes.n < l.demandees
     -- Tant que des sujets attendent, le lot n'est pas fini.
     and not exists (
       select 1 from public.sujets_anecdote s
        where s.lot_id = l.id and s.statut in ('a_rediger', 'en_cours')
     )
   order by l.created_at
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.lots_a_completer(int) from public, anon, authenticated;
grant execute on function public.lots_a_completer(int) to service_role;

-- 5. Le passage régulier. Rien à faire : pas d'appel, pas de coût.
create or replace function public.poursuivre_lots()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
       select 1 from public.sujets_anecdote s
        where s.tentatives < 2
          and (s.statut = 'a_rediger'
               or (s.statut = 'en_cours' and s.reserve_at < now() - interval '10 minutes'))
     )
     and not exists (select 1 from public.lots_a_completer(1)) then
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
    body := jsonb_build_object('mode', 'poursuivre'),
    timeout_milliseconds := 300000
  );
end;
$$;

revoke execute on function public.poursuivre_lots() from public, anon, authenticated;

select cron.unschedule('anecto-poursuivre-lots')
 where exists (select 1 from cron.job where jobname = 'anecto-poursuivre-lots');

select cron.schedule(
  'anecto-poursuivre-lots',
  '2-59/5 * * * *',
  $$select public.poursuivre_lots()$$
);

-- 6. Ne pas ouvrir un second lot sur une ville dont le premier est en cours.
-- Avant, une ville dont le lot rendait zéro anecdote n'avait pas de
-- « dernière anecdote » : rien ne l'empêchait d'être relancée à l'heure
-- suivante, dossier entier compris.
create or replace function public.villes_a_ouvrir(p_cible int default 10, p_limit int default 2)
returns table (ville text, place_id text, existantes int, combien int)
language sql
stable
security definer
set search_path = public
as $$
  with demandees as (
    select d.place_id,
           min(d.ville) as ville,
           count(*) as demandes,
           min(d.created_at) as premiere
      from public.demandes_ville d
     where d.notified_at is null
     group by d.place_id
  )
  select dd.ville,
         dd.place_id,
         stock.existantes,
         least(p_cible - stock.existantes, 10)::int
    from demandees dd
    cross join lateral (
      select count(*) filter (where a.status <> 'rejected')::int as existantes,
             max(a.created_at) as derniere
        from public.anecdotes a
       where a.city_place_id = dd.place_id
    ) stock
   where stock.existantes < p_cible
     and (stock.derniere is null or stock.derniere < now() - interval '20 hours')
     and not exists (
       select 1 from public.lots_generation l
        where l.city_place_id = dd.place_id
          and l.mode = 'generation'
          and l.created_at > now() - interval '20 hours'
     )
     and not exists (
       select 1 from public.sujets_anecdote s
        where s.city_place_id = dd.place_id and s.statut in ('a_rediger', 'en_cours')
     )
   order by dd.demandes desc, dd.premiere
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.villes_a_ouvrir(int, int) from public, anon, authenticated;

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
      select count(*) filter (where a.status = 'draft')::int as brouillons,
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

-- 7. Le rapport : ce qui reste à écrire dans chaque lot.
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
