-- Outil d'exploitation : monte le stock d'anecdotes vers une cible.
--
-- Écrit pendant la production des vingt premières villes, conservé parce que
-- l'opération se répétera à chaque nouvelle ville ouverte.
--
-- Choisit les villes les plus en retard sur la cible et déclenche la génération
-- pour chacune, au plus dix anecdotes par appel — au-delà, une invocation
-- dépasse le temps d'exécution d'une Edge Function.
--
-- L'exécution est réservée à `postgres` et `service_role` : chaque appel
-- consomme des crédits DeepSeek, et une fonction laissée aux droits par défaut
-- de Postgres serait appelable par n'importe quel porteur de la clé publiable.

create or replace function public.produire_lot(p_villes int default 6, p_cible int default 30)
returns table (ville text, deja int, demande int)
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
  with etat as (
    select v.nom_google, v.place_id, count(a.id)::int as n
      from public.seed_villes v
      left join public.anecdotes a
        on a.city_place_id = v.place_id and a.status <> 'rejected'
     group by v.nom_google, v.place_id
  ),
  -- Les villes les plus en retard d'abord : le stock se comble à peu près
  -- uniformément plutôt que ville par ville.
  choisies as (
    select nom_google, place_id, n, least(p_cible - n, 10) as combien
      from etat
     where n < p_cible
     order by n asc, random()
     limit p_villes
  ),
  lances as (
    select c.nom_google, c.n, c.combien,
           net.http_post(
             url := v_url || '/generate-anecdote',
             headers := jsonb_build_object(
               'Content-Type', 'application/json',
               'x-anecto-admin-secret', v_secret
             ),
             body := jsonb_build_object(
               'city', c.nom_google,
               'cityPlaceId', c.place_id,
               'count', c.combien
             ),
             timeout_milliseconds := 300000
           ) as req
      from choisies c
  )
  select l.nom_google, l.n, l.combien from lances l order by l.nom_google;
end;
$$;

revoke execute on function public.produire_lot(int, int) from public, anon, authenticated;
