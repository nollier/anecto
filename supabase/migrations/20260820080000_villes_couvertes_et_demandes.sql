-- Ne proposer que les villes qui ont du contenu, et recueillir les autres.
--
-- Jusqu'ici le choix de la ville passait par Google Places, sans aucun lien
-- avec ce que la base contient. Quelqu'un qui choisissait Bayonne obtenait
-- « Aucune anecdote disponible pour ta ville aujourd'hui. Reviens un peu plus
-- tard ! » — un message faux : il n'y aurait rien le lendemain non plus. Le
-- pire échec possible, à l'inscription, avant toute valeur délivrée.

-- 1. Les villes réellement servables.
--
-- Déduites des anecdotes validées, jamais d'une liste écrite en dur : une
-- ville ouverte apparaît d'elle-même, une ville dont le contenu est rejeté
-- disparaît. Toute autre approche finit par afficher une ville vide, soit
-- exactement le défaut qu'on corrige.
--
-- Pas de compteur exposé : la taille du stock reste hors de vue, comme pour
-- le carnet.
create or replace function public.villes_couvertes()
returns table (ville text, place_id text)
language sql
stable
security definer
set search_path = public
as $$
  select a.city, a.city_place_id
    from public.anecdotes a
   where a.status = 'validated'
     and a.city_place_id is not null
   group by a.city, a.city_place_id
   order by a.city;
$$;

revoke execute on function public.villes_couvertes() from public, anon;
grant execute on function public.villes_couvertes() to authenticated;

-- 2. Les villes demandées.
create table if not exists public.demandes_ville (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id text not null,
  ville text not null,
  pays text,
  created_at timestamptz not null default now(),
  -- Rempli à l'envoi du « ta ville est prête » : c'est lui qui empêche de
  -- prévenir deux fois la même personne.
  notified_at timestamptz,
  -- Une même personne ne demande une ville qu'une fois. Redemander est sans
  -- effet plutôt qu'une erreur.
  unique (user_id, place_id)
);

alter table public.demandes_ville enable row level security;

create policy "Chacun lit ses demandes"
  on public.demandes_ville for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists demandes_ville_a_prevenir_idx
  on public.demandes_ville (place_id)
  where notified_at is null;

-- 3. Enregistrer une demande.
--
-- Passe par une fonction plutôt que par un insert direct : le client n'a
-- ainsi aucun droit d'écriture sur la table, et l'identité vient du jeton et
-- non du corps de la requête.
create or replace function public.demander_ville(
  p_place_id text,
  p_ville text,
  p_pays text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  if coalesce(trim(p_place_id), '') = '' or coalesce(trim(p_ville), '') = '' then
    raise exception 'Ville invalide';
  end if;

  insert into public.demandes_ville (user_id, place_id, ville, pays)
  values (auth.uid(), trim(p_place_id), trim(p_ville), nullif(trim(coalesce(p_pays, '')), ''))
  on conflict (user_id, place_id) do nothing;
end;
$$;

revoke execute on function public.demander_ville(text, text, text) from public, anon;
grant execute on function public.demander_ville(text, text, text) to authenticated;

-- 4. Ce qu'il faut produire ensuite.
--
-- La vraie contrepartie du formulaire : au lieu de deviner quelle ville
-- ouvrir, on lit la demande. Vue d'administration, jamais lue par l'app.
create or replace view public.villes_a_produire
with (security_invoker = on) as
select d.ville,
       d.place_id,
       d.pays,
       count(*)::int as demandes,
       count(*) filter (where d.notified_at is null)::int as en_attente,
       min(d.created_at) as premiere_demande,
       max(d.created_at) as derniere_demande
  from public.demandes_ville d
 where not exists (
   select 1 from public.anecdotes a
    where a.city_place_id = d.place_id and a.status = 'validated'
 )
 group by d.ville, d.place_id, d.pays
 order by count(*) desc, min(d.created_at);

revoke all on public.villes_a_produire from anon, authenticated;

-- 5. Qui prévenir maintenant.
--
-- Une demande devient signalable dès que sa ville a des anecdotes validées.
-- Renvoie l'adresse pour l'envoi — `auth.users` n'est pas lisible autrement.
create or replace function public.demandes_a_prevenir(p_limit int default 100)
returns table (id uuid, email text, ville text)
language sql
security definer
set search_path = public
as $$
  select d.id, u.email::text, d.ville
    from public.demandes_ville d
    join auth.users u on u.id = d.user_id
   where d.notified_at is null
     and exists (
       select 1 from public.anecdotes a
        where a.city_place_id = d.place_id and a.status = 'validated'
     )
   order by d.created_at
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.demandes_a_prevenir(int) from public, anon, authenticated;
grant execute on function public.demandes_a_prevenir(int) to service_role;
