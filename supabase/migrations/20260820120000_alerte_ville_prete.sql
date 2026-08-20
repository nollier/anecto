-- Tenir la promesse faite au moment de la demande de ville.
--
-- `demandes_ville` recueille les villes qu'on ne couvre pas encore, et l'app
-- annonce « on te préviendra dès que ses anecdotes seront prêtes ». Sans cet
-- appel, la table se remplirait sans que personne ne soit jamais prévenu —
-- le même défaut que `feedback` avant l'alerte retours.

-- 1. Déclencheur.
create or replace function public.declencher_alerte_villes_pretes()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'anecto_functions_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'anecto_admin_secret';

  if v_url is null or v_secret is null then
    raise exception 'Secrets anecto_functions_url / anecto_admin_secret absents de Vault';
  end if;

  select net.http_post(
           url := v_url || '/notify-city-ready',
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'x-anecto-admin-secret', v_secret
           ),
           body := '{}'::jsonb,
           timeout_milliseconds := 60000
         ) into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function public.declencher_alerte_villes_pretes() from public, anon, authenticated;

-- 2. Un passage par jour.
--
-- Volontairement pas un trigger sur `anecdotes` : la validation se fait par
-- lots, et prévenir à la première anecdote validée enverrait un message pour
-- une ville qui n'a encore qu'un seul texte. Un passage quotidien laisse au
-- lot le temps de se constituer, et regroupe en un seul message les villes
-- ouvertes le même jour — ce que la fonction sait déjà faire.
select cron.unschedule('anecto-villes-pretes')
 where exists (select 1 from cron.job where jobname = 'anecto-villes-pretes');

select cron.schedule(
  'anecto-villes-pretes',
  '30 8 * * *',
  $$select public.declencher_alerte_villes_pretes()$$
);
