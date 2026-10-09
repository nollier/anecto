-- Les documents lus sans résultat.
--
-- Le 8 octobre, trois lots de Lille ont relu les mêmes notices (le CHR,
-- l'hôpital Sainte-Eugénie, les hôtels de Lequeux) et trois fois leurs sujets
-- ont été écartés comme déjà traités. Rien ne gardait la trace qu'un document
-- lu ne donnait rien : seul un document qui avait produit une anecdote
-- sortait du dossier.
--
-- `generate-anecdote` inscrit ici, à chaque plan, les documents dont aucun
-- sujet n'a survécu au tri et au contrôle des doublons. Ils sortent des
-- dossiers de la ville pendant trente jours.

create table if not exists public.sources_steriles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  city text not null,
  city_place_id text,
  article text not null,
  axe text not null,
  lot_id uuid references public.lots_generation (id) on delete set null
);

alter table public.sources_steriles enable row level security;

create index if not exists sources_steriles_ville
  on public.sources_steriles (city_place_id, created_at);
create index if not exists sources_steriles_nom_ville
  on public.sources_steriles (city, created_at);
