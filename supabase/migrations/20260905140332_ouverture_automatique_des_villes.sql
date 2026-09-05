-- Ouvrir une ville demandée sans intervention humaine.
--
-- `demandes_ville` recueille les demandes depuis août, et l'email « ta ville
-- est prête » part tout seul dès qu'une anecdote validée existe. Entre les
-- deux, rien : `produire_lot` travaille sur `seed_villes`, une liste figée de
-- vingt villes sans aucun lien avec ce que les lecteurs réclament. Vannes
-- attendait depuis le 25 août.
--
-- Ce qui suit ferme la chaîne : la demande déclenche la production, la
-- production s'auto-valide sous condition, l'alerte part au lecteur.

-- 1. Le verdict de la vérification, lisible sans analyser une phrase.
--
-- `generate-anecdote` écrit déjà le verdict dans `verification_notes`, en
-- français, en tête d'un texte libre. Fonder une publication automatique sur
-- l'analyse de cette phrase, c'est publier au gré d'une reformulation. La
-- colonne le rend explicite et interrogeable.
--
-- Trois valeurs seulement peuvent arriver ici : `refute` fait rejeter
-- l'anecdote avant l'insertion, elle n'atteint jamais la table.
alter table public.anecdotes
  add column if not exists verdict text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'anecdotes_verdict_check'
  ) then
    alter table public.anecdotes
      add constraint anecdotes_verdict_check
      check (verdict is null or verdict in ('confirme', 'doute'));
  end if;
end;
$$;

comment on column public.anecdotes.verdict is
  'Verdict du second passage de vérification. Null sur les anecdotes générées avant la colonne.';

-- 2. La validation automatique, et ses trois conditions.
--
-- Une anecdote n'arrive en base que si ses citations ont été retrouvées mot
-- pour mot dans le dossier documentaire et si la vérification ne l'a pas
-- réfutée. Ces deux filtres sont déterministes, ils tiennent sans nous. La
-- publication automatique en ajoute deux : le verdict doit être une
-- confirmation franche, pas un doute, et la confiance doit être haute.
--
-- Tout le reste — doute, confiance moyenne ou faible, verdict absent parce que
-- généré avant cette migration — reste en brouillon et attend une relecture
-- humaine dans `anecdotes_a_valider`.
create or replace function public.valider_automatiquement(p_limit int default 100)
returns int
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
        and a.verdict = 'confirme'
        and a.confidence = 'haute'
      order by a.created_at
      limit greatest(p_limit, 1)
   );

  get diagnostics v_validees = row_count;
  return v_validees;
end;
$$;

revoke execute on function public.valider_automatiquement(int) from public, anon, authenticated;

-- 3. Les villes à ouvrir, et de combien d'anecdotes.
--
-- Le stock compte les brouillons autant que les validées : une anecdote en
-- attente de relecture est déjà produite, la régénérer serait payer deux fois
-- le même texte. Les rejetées ne comptent pas, elles n'existeront jamais.
create or replace function public.villes_a_ouvrir(p_cible int default 15, p_limit int default 2)
returns table (ville text, place_id text, existantes int, combien int)
language sql
stable
security definer
set search_path = public
as $$
  with demandees as (
    -- Un même lieu peut être demandé sous deux libellés : c'est le place_id
    -- qui fait foi, le nom n'est qu'un affichage.
    select d.place_id,
           min(d.ville) as ville,
           count(*) as demandes,
           min(d.created_at) as premiere
      from public.demandes_ville d
     group by d.place_id
  )
  select dd.ville,
         dd.place_id,
         stock.existantes,
         least(p_cible - stock.existantes, 10)::int
    from demandees dd
    cross join lateral (
      select count(*)::int as existantes
        from public.anecdotes a
       where a.city_place_id = dd.place_id
         and a.status <> 'rejected'
    ) stock
   where stock.existantes < p_cible
   -- La ville la plus réclamée d'abord, et à égalité la plus ancienne : celui
   -- qui attend depuis trois semaines passe avant celui d'hier.
   order by dd.demandes desc, dd.premiere
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.villes_a_ouvrir(int, int) from public, anon, authenticated;

-- 4. Produire ce qui manque.
--
-- Jumelle de `produire_lot`, avec une seule différence qui change tout : la
-- source n'est plus une liste écrite d'avance mais ce que les lecteurs
-- demandent.
create or replace function public.produire_villes_demandees(p_villes int default 2, p_cible int default 15)
returns table (ville text, existantes int, demande int)
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
  with a_ouvrir as (
    select * from public.villes_a_ouvrir(p_cible, p_villes)
  ),
  lances as (
    select v.ville, v.existantes, v.combien,
           net.http_post(
             url := v_url || '/generate-anecdote',
             headers := jsonb_build_object(
               'Content-Type', 'application/json',
               'x-anecto-admin-secret', v_secret
             ),
             body := jsonb_build_object(
               'city', v.ville,
               'cityPlaceId', v.place_id,
               'count', v.combien
             ),
             timeout_milliseconds := 300000
           ) as req
      from a_ouvrir v
  )
  select l.ville, l.existantes, l.combien from lances l order by l.ville;
end;
$$;

revoke execute on function public.produire_villes_demandees(int, int) from public, anon, authenticated;

-- 5. Ne prévenir qu'une ville réellement lisible.
--
-- La version précédente signalait dès la première anecdote validée. C'était
-- sans conséquence tant qu'un humain validait par lots de vingt ; avec la
-- publication automatique, une seule anecdote suffirait à déclencher l'email,
-- et le lecteur arriverait sur une ville qu'il épuise le soir même.
--
-- Cinq anecdotes, donc — sauf si la demande a plus de sept jours. Certaines
-- villes n'ont pas assez de matière documentaire pour en produire cinq, et
-- laisser quelqu'un attendre indéfiniment un seuil qui ne tombera jamais
-- serait pire que de le prévenir sur trois textes.
create or replace function public.demandes_a_prevenir(p_limit int default 100)
returns table (id uuid, email text, ville text)
language sql
security definer
set search_path = public
as $$
  select d.id, u.email::text, d.ville
    from public.demandes_ville d
    join auth.users u on u.id = d.user_id
   cross join lateral (
     select count(*)::int as validees
       from public.anecdotes a
      where a.city_place_id = d.place_id and a.status = 'validated'
   ) stock
   where d.notified_at is null
     and stock.validees >= case when d.created_at < now() - interval '7 days' then 1 else 5 end
   order by d.created_at
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.demandes_a_prevenir(int) from public, anon, authenticated;
grant execute on function public.demandes_a_prevenir(int) to service_role;

-- 6. Le rythme.
--
-- Production toutes les heures, deux villes au plus par passage : une ville
-- demandée atteint sa cible en deux passages, et une rafale de demandes
-- s'étale au lieu de partir en une seule facture DeepSeek.
select cron.unschedule('anecto-villes-demandees')
 where exists (select 1 from cron.job where jobname = 'anecto-villes-demandees');

select cron.schedule(
  'anecto-villes-demandees',
  '7 * * * *',
  $$select public.produire_villes_demandees(2, 15)$$
);

-- Validation toutes les quinze minutes : c'est du SQL pur, ça ne coûte rien,
-- et ça raccourcit d'autant le délai entre la production et l'email.
select cron.unschedule('anecto-validation-auto')
 where exists (select 1 from cron.job where jobname = 'anecto-validation-auto');

select cron.schedule(
  'anecto-validation-auto',
  '*/15 * * * *',
  $$select public.valider_automatiquement(100)$$
);

-- L'alerte aux lecteurs passe de une fois par jour à toutes les deux heures en
-- journée. Le seuil de cinq anecdotes remplace désormais l'attente d'un jour
-- entier pour laisser le lot se constituer, et quelqu'un qui demande sa ville
-- le matin peut être prévenu l'après-midi.
select cron.unschedule('anecto-villes-pretes')
 where exists (select 1 from cron.job where jobname = 'anecto-villes-pretes');

select cron.schedule(
  'anecto-villes-pretes',
  '30 8-20/2 * * *',
  $$select public.declencher_alerte_villes_pretes()$$
);
