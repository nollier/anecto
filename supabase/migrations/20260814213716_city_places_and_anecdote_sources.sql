-- Ville normalisée via Google Places + traçabilité des sources d'anecdote.
--
-- Avant : `profiles.city` était du texte libre, donc « Paris », « paris » et
-- « PARIS » étaient trois villes distinctes et aucune anecdote ne matchait.
-- Le place_id Google est désormais la clé de rattachement ; `city` ne sert
-- plus qu'à l'affichage.

alter table public.profiles
  add column if not exists city_place_id text,
  add column if not exists city_lat double precision,
  add column if not exists city_lng double precision,
  add column if not exists country_code text,
  add column if not exists timezone text;

create index if not exists profiles_city_place_id_idx
  on public.profiles (city_place_id);

alter table public.anecdotes
  add column if not exists city_place_id text,
  add column if not exists period text,
  add column if not exists source_url text,
  add column if not exists sources jsonb,
  add column if not exists confidence text,
  add column if not exists verification_notes text,
  add column if not exists generated_by text;

alter table public.anecdotes
  drop constraint if exists anecdotes_confidence_check;

alter table public.anecdotes
  add constraint anecdotes_confidence_check
  check (confidence is null or confidence in ('haute', 'moyenne', 'faible'));

create index if not exists anecdotes_city_place_id_status_idx
  on public.anecdotes (city_place_id, status);

-- Empêche la génération de réenregistrer deux fois la même anecdote :
-- l'Edge Function s'appuie sur la violation 23505 pour le détecter.
create unique index if not exists anecdotes_city_place_title_key
  on public.anecdotes (city_place_id, lower(title));
