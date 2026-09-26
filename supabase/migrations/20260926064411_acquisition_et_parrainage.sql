-- D'où viennent les lecteurs, qui les amène, et ce que Google peut lire.
--
-- Dix-huit inscriptions en sept semaines, dont une seule sur chacune des trois
-- dernières, et aucun moyen de dire d'où venaient les premières. Cette
-- migration pose trois choses :
--
--   1. la mesure : chaque visite de la page de téléchargement et chaque clic
--      vers un magasin, rattachés au canal qui l'a amenée (`?src=`), puis la
--      provenance déclarée par l'app à l'inscription ;
--   2. le parrainage : un code par lecteur, glissé dans les liens qu'il
--      partage, et un compteur de ce que ces liens ont produit ;
--   3. la vitrine : de quoi générer des pages web indexables par ville, sans
--      ouvrir le corpus en bloc.

-- 1. Le code de parrainage.
--
-- Six caractères, sans 0/O ni 1/I/L : il doit pouvoir se dicter et se
-- recopier à la main depuis la page de téléchargement, seul chemin sur
-- iPhone où l'App Store ne transmet rien à l'app.
create table if not exists public.codes_parrainage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);

-- Aucune politique : tout passe par les fonctions ci-dessous, et personne ne
-- doit pouvoir lister les codes des autres.
alter table public.codes_parrainage enable row level security;

create or replace function public.mon_code_parrainage()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  select c.code into v_code from public.codes_parrainage c where c.user_id = auth.uid();
  if v_code is not null then
    return v_code;
  end if;

  -- 31^6 ≈ 900 millions de codes : la collision est rare, mais elle se
  -- rattrape par un nouveau tirage plutôt que par une erreur.
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code
      from generate_series(1, 6);

    begin
      insert into public.codes_parrainage (user_id, code) values (auth.uid(), v_code);
      return v_code;
    exception when unique_violation then
      -- Deux appels simultanés du même lecteur : le premier a gagné.
      select c.code into v_code from public.codes_parrainage c where c.user_id = auth.uid();
      if v_code is not null then
        return v_code;
      end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.mon_code_parrainage() from public, anon;
grant execute on function public.mon_code_parrainage() to authenticated;

-- 2. Les visites de la page de téléchargement.
--
-- Rien qui identifie une personne : ni adresse IP, ni agent utilisateur
-- complet, seulement la famille de l'appareil. La table sert à compter, pas
-- à suivre quelqu'un.
create table if not exists public.visites_telechargement (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  etape text not null check (etape in ('visite', 'clic_android', 'clic_ios')),
  source text check (source ~ '^[a-z0-9_-]{1,32}$'),
  code_parrainage text check (code_parrainage ~ '^[A-HJKMNP-Z2-9]{6}$'),
  plateforme text check (plateforme in ('android', 'ios', 'autre'))
);

alter table public.visites_telechargement enable row level security;

create index if not exists visites_telechargement_code_idx
  on public.visites_telechargement (code_parrainage)
  where code_parrainage is not null;

-- Seule écriture publique de toute la base, d'où une fonction qui valide
-- plutôt qu'un insert ouvert : un paramètre hors format est ramené à null au
-- lieu de faire échouer l'appel, la page n'a pas à gérer d'erreur.
create or replace function public.enregistrer_visite(
  p_etape text,
  p_source text default null,
  p_code text default null,
  p_plateforme text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := lower(trim(coalesce(p_source, '')));
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if p_etape not in ('visite', 'clic_android', 'clic_ios') then
    return;
  end if;

  insert into public.visites_telechargement (etape, source, code_parrainage, plateforme)
  values (
    p_etape,
    case when v_source ~ '^[a-z0-9_-]{1,32}$' then v_source end,
    case when v_code ~ '^[A-HJKMNP-Z2-9]{6}$' then v_code end,
    case when p_plateforme in ('android', 'ios', 'autre') then p_plateforme end
  );
end;
$$;

revoke execute on function public.enregistrer_visite(text, text, text, text) from public;
grant execute on function public.enregistrer_visite(text, text, text, text) to anon, authenticated;

-- 3. La provenance d'un compte.
--
-- Une ligne par lecteur, écrite une fois : c'est le premier canal qui compte.
-- Sur Android, l'app la remplit seule depuis le référent d'installation de
-- Google Play ; sur iPhone, Apple ne transmet rien, et seul le code saisi à
-- la main rattache un filleul à son parrain.
create table if not exists public.provenances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  source text check (source ~ '^[a-z0-9_.-]{1,64}$'),
  -- Le parrain qui supprime son compte ne doit pas emporter la ligne de son
  -- filleul : on perd le lien, pas la provenance.
  parrain_id uuid references auth.users (id) on delete set null,
  plateforme text check (plateforme in ('android', 'ios', 'autre')),
  created_at timestamptz not null default now()
);

alter table public.provenances enable row level security;

create index if not exists provenances_parrain_idx
  on public.provenances (parrain_id)
  where parrain_id is not null;

-- Le parrain d'un code, s'il est recevable pour le lecteur courant : pas
-- soi-même, et seulement pour un compte récent. Un lecteur inscrit depuis
-- des mois qui réinstalle par le lien d'un ami n'est pas un filleul.
create or replace function public.parrain_recevable(p_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id
    from public.codes_parrainage c
    join auth.users u on u.id = auth.uid()
   where c.code = upper(trim(coalesce(p_code, '')))
     and c.user_id <> auth.uid()
     and u.created_at > now() - interval '30 days';
$$;

revoke execute on function public.parrain_recevable(text) from public, anon, authenticated;

create or replace function public.enregistrer_provenance(
  p_source text default null,
  p_code text default null,
  p_plateforme text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := lower(trim(coalesce(p_source, '')));
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  insert into public.provenances (user_id, source, parrain_id, plateforme)
  values (
    auth.uid(),
    case when v_source ~ '^[a-z0-9_.-]{1,64}$' then v_source end,
    public.parrain_recevable(p_code),
    case when p_plateforme in ('android', 'ios', 'autre') then p_plateforme end
  )
  on conflict (user_id) do nothing;
end;
$$;

revoke execute on function public.enregistrer_provenance(text, text, text) from public, anon;
grant execute on function public.enregistrer_provenance(text, text, text) to authenticated;

-- Le code saisi à la main. Il complète la provenance sans l'écraser : un
-- parrain déjà connu reste celui-là.
create or replace function public.saisir_code_parrainage(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parrain uuid;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  v_parrain := public.parrain_recevable(p_code);
  if v_parrain is null then
    return false;
  end if;

  insert into public.provenances (user_id, source, parrain_id)
  values (auth.uid(), 'parrainage', v_parrain)
  on conflict (user_id) do update
     set parrain_id = excluded.parrain_id
   where public.provenances.parrain_id is null;

  return exists (
    select 1 from public.provenances p
     where p.user_id = auth.uid() and p.parrain_id = v_parrain
  );
end;
$$;

revoke execute on function public.saisir_code_parrainage(text) from public, anon;
grant execute on function public.saisir_code_parrainage(text) to authenticated;

-- Ce que le lecteur voit de son parrainage : combien de fois son lien a été
-- ouvert, combien de comptes il a amenés. Pas qui : les filleuls restent
-- anonymes pour leur parrain.
create or replace function public.mes_parrainages()
returns table (code text, ouvertures int, inscrits int, parraine boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.code,
         (select count(*)::int from public.visites_telechargement v
           where v.code_parrainage = c.code and v.etape = 'visite'),
         (select count(*)::int from public.provenances p
           where p.parrain_id = auth.uid()),
         exists (select 1 from public.provenances p
                  where p.user_id = auth.uid() and p.parrain_id is not null)
    from public.codes_parrainage c
   where c.user_id = auth.uid();
$$;

revoke execute on function public.mes_parrainages() from public, anon;
grant execute on function public.mes_parrainages() to authenticated;

-- 4. Le tableau de bord d'acquisition.
--
-- Vue d'administration, comme `villes_a_produire` : jamais lue par l'app.
-- Les visites et les clics se comptent par canal ; les inscriptions aussi,
-- mais seulement celles qu'on sait rattacher (Android, ou code saisi).
create or replace view public.acquisition_par_source
with (security_invoker = on) as
with visites as (
  select coalesce(source, '(direct)') as source,
         count(*) filter (where etape = 'visite')::int as visites,
         count(*) filter (where etape = 'clic_android')::int as clics_android,
         count(*) filter (where etape = 'clic_ios')::int as clics_ios
    from public.visites_telechargement
   group by 1
),
comptes as (
  select coalesce(source, '(inconnu)') as source,
         count(*)::int as inscrits,
         count(*) filter (where parrain_id is not null)::int as parraines
    from public.provenances
   group by 1
)
select coalesce(v.source, c.source) as source,
       coalesce(v.visites, 0) as visites,
       coalesce(v.clics_android, 0) as clics_android,
       coalesce(v.clics_ios, 0) as clics_ios,
       coalesce(c.inscrits, 0) as inscrits,
       coalesce(c.parraines, 0) as parraines
  from visites v
  full join comptes c on c.source = v.source
 order by 2 desc, 5 desc;

revoke all on public.acquisition_par_source from anon, authenticated;

-- 5. La vitrine publique.
--
-- La lecture des anecdotes est réservée aux comptes connectés depuis le
-- durcissement d'août, pour que le corpus ne se copie pas d'un seul appel.
-- Les pages web par ville en exposent une part choisie : trois anecdotes
-- entières par ville, les autres réduites à leur accroche.
--
-- Les trois entières sont les trois plus anciennes validées de la ville : un
-- choix stable, qui ne bouge pas quand une anecdote s'ajoute. Une page
-- indexée par Google qui perdrait son texte la semaine suivante serait pire
-- que pas de page.
create or replace function public.vitrine_anecdotes()
returns table (
  id uuid,
  ville text,
  place_id text,
  title text,
  hook text,
  period text,
  body text,
  source text,
  source_url text,
  created_at timestamptz,
  integrale boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with classees as (
    select a.*,
           row_number() over (partition by a.city_place_id order by a.created_at, a.id) as rang
      from public.anecdotes a
     where a.status = 'validated'
       and a.city_place_id is not null
  )
  select c.id,
         c.city,
         c.city_place_id,
         c.title,
         c.hook,
         c.period,
         case when c.rang <= 3 then c.body end,
         case when c.rang <= 3 then c.source end,
         case when c.rang <= 3 then c.source_url end,
         c.created_at,
         c.rang <= 3
    from classees c
   order by c.city, c.rang;
$$;

revoke execute on function public.vitrine_anecdotes() from public;
grant execute on function public.vitrine_anecdotes() to anon, authenticated;
