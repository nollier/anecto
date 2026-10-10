-- Les villes voisines, quand la sienne est épuisée.
--
-- Le 10 octobre, Saint-Jean-de-Luz n'a plus rien donné : 38 anecdotes, et
-- Wikipédia comme Mérimée vidés. Une petite ville finit toujours par
-- s'épuiser. Ciboure, de l'autre côté du port, en a d'autres.
--
-- Les règles, fixées le 10 octobre :
--
--   1. La ville du lecteur passe toujours en premier. Une voisine n'est
--      servie que les jours où il ne reste rien de neuf chez lui.
--   2. Le lecteur donne son accord une fois pour toutes
--      (`profiles.villes_voisines`), quand il arrive au bout de sa ville.
--      Nul : jamais demandé. Il peut changer d'avis dans les réglages.
--   3. Les voisines sont les communes à moins de 30 km, de la plus proche à
--      la plus lointaine. On écarte les villages de moins de 1 500 habitants :
--      leur matière documentaire est trop mince pour une production.
--   4. Une voisine n'est produite que pour un lecteur qui a dit oui et qui
--      arrive au bout de sa ville : pas de crédits DeepSeek dépensés d'avance.

-- 1. Les communes de France, avec leur centre et leur population.
--
-- Référentiel de l'État (geo.api.gouv.fr), chargé en deux temps parce que
-- pg_net est asynchrone : `charger_communes()` lance la requête,
-- `importer_communes(id)` lit la réponse une fois arrivée.
create table if not exists public.communes (
  insee text primary key,
  nom text not null,
  departement text,
  lat double precision not null,
  lng double precision not null,
  population int
);
alter table public.communes enable row level security;
create index if not exists communes_lat_lng on public.communes (lat, lng);

create or replace function public.charger_communes()
returns bigint
language sql
security definer
set search_path = public, extensions
as $$
  select net.http_get(
    url := 'https://geo.api.gouv.fr/communes?fields=nom,code,centre,population,codeDepartement&format=json',
    timeout_milliseconds := 60000
  );
$$;

create or replace function public.importer_communes(p_requete bigint)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_n int;
begin
  insert into public.communes (insee, nom, departement, lat, lng, population)
  select c->>'code',
         c->>'nom',
         c->>'codeDepartement',
         (c->'centre'->'coordinates'->>1)::double precision,
         (c->'centre'->'coordinates'->>0)::double precision,
         nullif(c->>'population', '')::int
    from net._http_response r,
         jsonb_array_elements(r.content::jsonb) c
   where r.id = p_requete
     and r.status_code = 200
     and c->'centre'->'coordinates' is not null
  on conflict (insee) do update
     set nom = excluded.nom,
         departement = excluded.departement,
         lat = excluded.lat,
         lng = excluded.lng,
         population = excluded.population;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.charger_communes() from public, anon, authenticated;
revoke execute on function public.importer_communes(bigint) from public, anon, authenticated;

/** Distance en kilomètres entre deux points (haversine). */
create or replace function public.distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create or replace function public.communes_proches(
  p_lat double precision,
  p_lng double precision,
  p_rayon_km double precision default 30,
  p_limite int default 10,
  p_population_min int default 1500
)
returns table (insee text, nom text, departement text, population int, distance_km double precision)
language sql
stable
security definer
set search_path = public
as $$
  select c.insee, c.nom, c.departement, c.population,
         public.distance_km(p_lat, p_lng, c.lat, c.lng) as d
    from public.communes c
   -- Un carré d'abord, pour que l'index serve ; le cercle ensuite.
   where c.lat between p_lat - p_rayon_km / 111.0 and p_lat + p_rayon_km / 111.0
     and c.lng between p_lng - p_rayon_km / (111.0 * cos(radians(p_lat)))
                   and p_lng + p_rayon_km / (111.0 * cos(radians(p_lat)))
     and coalesce(c.population, 0) >= p_population_min
     and public.distance_km(p_lat, p_lng, c.lat, c.lng) <= p_rayon_km
   order by d
   limit greatest(p_limite, 1);
$$;

revoke execute on function public.communes_proches(double precision, double precision, double precision, int, int) from public, anon, authenticated;
grant execute on function public.communes_proches(double precision, double precision, double precision, int, int) to service_role;

-- 2. Les villes des lecteurs, situées, et leurs voisines.
--
-- Le profil ne garde que l'identifiant Google de la ville (le catalogue
-- n'expose pas de coordonnées). La fonction `villes-voisines` les demande à
-- Google, retrouve les communes proches, et donne à chacune son identifiant
-- Google : c'est lui qui rattache les anecdotes à une ville.
create table if not exists public.villes_geo (
  place_id text primary key,
  ville text,
  lat double precision,
  lng double precision,
  voisines_calculees_at timestamptz
);
alter table public.villes_geo enable row level security;

create table if not exists public.villes_voisines (
  place_id text not null,
  voisin_place_id text not null,
  voisin_ville text not null,
  voisin_insee text,
  distance_km numeric(5, 1) not null,
  rang int not null,
  created_at timestamptz not null default now(),
  primary key (place_id, voisin_place_id)
);
alter table public.villes_voisines enable row level security;
create index if not exists villes_voisines_rang on public.villes_voisines (place_id, rang);

-- 3. L'accord du lecteur.
alter table public.profiles
  add column if not exists villes_voisines boolean;

-- 4. L'anecdote du jour : sa ville d'abord, ses voisines ensuite.
create or replace function public.get_daily_anecdote_for(p_user uuid)
returns public.anecdotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_today date;
  v_anecdote public.anecdotes;
begin
  if p_user is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select * into v_profile from public.profiles where id = p_user;
  if not found or coalesce(v_profile.city_place_id, v_profile.city) is null then
    return null;
  end if;

  v_today := (now() at time zone coalesce(v_profile.timezone, 'UTC'))::date;

  -- Déjà servie aujourd'hui : la même, qu'elle vienne de la ville ou d'une
  -- voisine. Une anecdote d'une ville quittée depuis ne compte plus.
  select a.* into v_anecdote
    from public.user_anecdote_history h
    join public.anecdotes a on a.id = h.anecdote_id
   where h.user_id = p_user
     and h.sent_on = v_today
     and (
       case
         when v_profile.city_place_id is not null
           then a.city_place_id = v_profile.city_place_id
         else a.city = v_profile.city
       end
       or (
         coalesce(v_profile.villes_voisines, false)
         and a.city_place_id in (
           select v.voisin_place_id from public.villes_voisines v
            where v.place_id = v_profile.city_place_id
         )
       )
     )
   order by h.sent_at desc
   limit 1;

  if found then
    return v_anecdote;
  end if;

  -- Sa ville, toujours en premier.
  select a.* into v_anecdote
    from public.anecdotes a
   where a.status = 'validated'
     and case
           when v_profile.city_place_id is not null
             then a.city_place_id = v_profile.city_place_id
           else a.city = v_profile.city
         end
     and not exists (
       select 1 from public.user_anecdote_history h
        where h.user_id = p_user and h.anecdote_id = a.id
     )
   order by a.reuse_count, random()
   limit 1;

  -- Rien de neuf chez lui, et il a dit oui : la voisine la plus proche qui a
  -- encore quelque chose à lui apprendre.
  if not found and coalesce(v_profile.villes_voisines, false) and v_profile.city_place_id is not null then
    select a.* into v_anecdote
      from public.villes_voisines v
      join public.anecdotes a on a.city_place_id = v.voisin_place_id
     where v.place_id = v_profile.city_place_id
       and a.status = 'validated'
       and not exists (
         select 1 from public.user_anecdote_history h
          where h.user_id = p_user and h.anecdote_id = a.id
       )
     order by v.rang, a.reuse_count, random()
     limit 1;
  end if;

  if v_anecdote.id is null then
    return null;
  end if;

  insert into public.user_anecdote_history (user_id, anecdote_id, sent_on)
  values (p_user, v_anecdote.id, v_today)
  on conflict (user_id, anecdote_id) do nothing;

  update public.anecdotes set reuse_count = reuse_count + 1 where id = v_anecdote.id;
  v_anecdote.reuse_count := v_anecdote.reuse_count + 1;
  return v_anecdote;
end;
$$;

-- 5. Ce que l'app affiche : le stock de la ville, l'accord, les voisines.
create or replace function public.mon_voisinage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_user is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_user;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'place_id', v_profile.city_place_id,
    'ville', v_profile.city,
    'accepte', v_profile.villes_voisines,
    'restantes', (
      select count(*)::int
        from public.anecdotes a
       where a.status = 'validated'
         and a.city_place_id = v_profile.city_place_id
         and not exists (
           select 1 from public.user_anecdote_history h
            where h.user_id = v_user and h.anecdote_id = a.id
         )
    ),
    'voisines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'place_id', v.voisin_place_id,
               'ville', v.voisin_ville,
               'distance_km', v.distance_km
             ) order by v.rang)
        from public.villes_voisines v
       where v.place_id = v_profile.city_place_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.mon_voisinage() from public, anon;
grant execute on function public.mon_voisinage() to authenticated;

-- 6. Calculer les voisines des villes dont un lecteur a dit oui.
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
   where p.villes_voisines
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

create or replace function public.calculer_villes_voisines()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Rien à calculer : pas d'appel, pas de coût.
  if not exists (select 1 from public.voisines_a_calculer(1)) then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'anecto_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'anecto_admin_secret';
  if v_url is null or v_secret is null then
    raise exception 'Secrets anecto_functions_url / anecto_admin_secret absents de Vault';
  end if;

  return net.http_post(
    url := v_url || '/villes-voisines',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-anecto-admin-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function public.calculer_villes_voisines() from public, anon, authenticated;

select cron.unschedule('anecto-villes-voisines')
 where exists (select 1 from cron.job where jobname = 'anecto-villes-voisines');
select cron.schedule('anecto-villes-voisines', '11,41 * * * *', $$select public.calculer_villes_voisines()$$);

-- 7. Produire une voisine, pour un lecteur qui en aura bientôt besoin.
--
-- Pour chaque lecteur qui a dit oui et à qui il reste trois anecdotes ou
-- moins dans sa ville, la première voisine (la plus proche) dont il n'a pas
-- au moins cinq anecdotes à lire. Mêmes garde-fous que le réassort : pas de
-- second lot en vingt heures, pas de brouillon ni de sujet en attente.
--
-- Une voisine dont un lot terminé a rendu zéro anecdote ces quatorze
-- derniers jours est sautée : sans cela, un village sans matière (Ahetze,
-- 2 100 habitants, deuxième voisine de Saint-Jean-de-Luz) serait relancé
-- chaque matin et bloquerait les suivantes.
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

create or replace function public.reassortir_voisines(p_villes int default 2, p_combien int default 10)
returns table (ville text, demande int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'anecto_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'anecto_admin_secret';
  if v_url is null or v_secret is null then
    raise exception 'Secrets anecto_functions_url / anecto_admin_secret absents de Vault';
  end if;

  return query
  with choisies as (
    select * from public.voisines_a_produire(p_villes)
  ),
  lances as (
    select c.ville,
           net.http_post(
             url := v_url || '/generate-anecdote',
             headers := jsonb_build_object('Content-Type', 'application/json', 'x-anecto-admin-secret', v_secret),
             body := jsonb_build_object('city', c.ville, 'cityPlaceId', c.place_id, 'count', least(p_combien, 10)),
             timeout_milliseconds := 300000
           ) as req
      from choisies c
  )
  select l.ville, least(p_combien, 10) from lances l order by l.ville;
end;
$$;

revoke execute on function public.reassortir_voisines(int, int) from public, anon, authenticated;

-- Après le réassort de 5 h : la ville du lecteur passe d'abord.
select cron.unschedule('anecto-reassort-voisines')
 where exists (select 1 from cron.job where jobname = 'anecto-reassort-voisines');
select cron.schedule('anecto-reassort-voisines', '20 5 * * *', $$select public.reassortir_voisines(2, 10)$$);
