-- Deux règles de production, toutes deux par lots de dix.
--
--   1. Nouvelle ville demandée : dix anecdotes. La cible était de quinze, et
--      la ville restait « à ouvrir » tant qu'elle n'y était pas, même après
--      que son lecteur avait été prévenu : chaque rejet à la relecture
--      relançait une génération. Bénodet en a accumulé vingt-deux rejetées.
--      Désormais une demande n'est servie que tant qu'elle n'a pas été
--      notifiée ; une fois la ville ouverte, c'est la règle 2 qui prend le
--      relais.
--
--   2. Stock bas : dix nouvelles anecdotes. Une ville est en stock bas quand
--      l'un de ses lecteurs n'a plus que trois anecdotes publiées à lire, le
--      seuil que le rapport quotidien signale déjà. Le réassort précédent
--      (`produire_lot(6, 30)`, écrit le 27 septembre mais jamais appliqué en
--      base) visait la liste figée `seed_villes`, sans regarder les lecteurs.
--
-- Les deux attendent vingt heures entre deux lots d'une même ville : la
-- génération prend plusieurs minutes, la validation automatique passe toutes
-- les quinze, et sans ce délai le passage suivant verrait un stock encore
-- vide et relancerait. Le stock bas attend en plus que les brouillons de la
-- ville aient été relus : en produire dix autres par-dessus ne ferait
-- qu'allonger la file de relecture.
--
-- Qu'aucun lot ne reprenne un thème déjà publié, c'est `generate-anecdote`
-- qui le garantit, anecdote par anecdote (voir `doublons.ts`).

-- 1. Nouvelle ville.
create or replace function public.villes_a_ouvrir(p_cible int default 10, p_limit int default 2)
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
   -- La ville la plus réclamée d'abord, et à égalité la plus ancienne : celui
   -- qui attend depuis trois semaines passe avant celui d'hier.
   order by dd.demandes desc, dd.premiere
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.villes_a_ouvrir(int, int) from public, anon, authenticated;

select cron.unschedule('anecto-villes-demandees')
 where exists (select 1 from cron.job where jobname = 'anecto-villes-demandees');

select cron.schedule(
  'anecto-villes-demandees',
  '7 * * * *',
  $$select public.produire_villes_demandees(2, 10)$$
);

-- 2. Stock bas.
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
   -- Le lecteur le plus près de la rupture d'abord.
   order by v.restantes, v.ville
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.villes_en_stock_bas(int, int) from public, anon, authenticated;

create or replace function public.reassortir_stock_bas(p_villes int default 6, p_combien int default 10)
returns table (ville text, restantes int, demande int)
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
    select * from public.villes_en_stock_bas(3, p_villes)
  ),
  lances as (
    select c.ville, c.restantes,
           net.http_post(
             url := v_url || '/generate-anecdote',
             headers := jsonb_build_object(
               'Content-Type', 'application/json',
               'x-anecto-admin-secret', v_secret
             ),
             body := jsonb_build_object(
               'city', c.ville,
               'cityPlaceId', c.place_id,
               'count', least(p_combien, 10)
             ),
             timeout_milliseconds := 300000
           ) as req
      from choisies c
  )
  select l.ville, l.restantes, least(p_combien, 10) from lances l order by l.ville;
end;
$$;

revoke execute on function public.reassortir_stock_bas(int, int) from public, anon, authenticated;

-- Une fois par jour, avant le rapport de 6 h. Remplace le réassort sur
-- `seed_villes` de la migration du 27 septembre.
select cron.unschedule('anecto-reassort-stock-bas')
 where exists (select 1 from cron.job where jobname = 'anecto-reassort-stock-bas');

select cron.schedule(
  'anecto-reassort-stock-bas',
  '0 5 * * *',
  $$select public.reassortir_stock_bas(6, 10)$$
);
