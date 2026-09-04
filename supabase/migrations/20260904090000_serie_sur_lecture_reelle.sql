-- La série ne comptait pas ce qu'elle annonçait.
--
-- `mes_statistiques` déduisait la série des dates `sent_on` de
-- `user_anecdote_history`. Or cette ligne est écrite par
-- `get_daily_anecdote_for`, que le cron de notifications appelle chaque jour
-- pour tout profil ayant un jeton push et une ville — avant même que la
-- notification parte, et sans jamais savoir si elle a été ouverte.
--
-- Conséquence : « 7 jours d'affilée » s'affichait pour quelqu'un qui n'avait
-- pas ouvert l'app depuis une semaine. La série ne pouvait se rompre que par
-- une rupture de stock dans sa ville, ou par un échec du cron — jamais par
-- l'absence du lecteur, qui est pourtant la seule chose qu'elle prétend
-- mesurer.
--
-- `read_at` sépare l'envoi de la lecture. Le cron ne l'écrit jamais : seule
-- l'app la remplit, à l'affichage réel de l'anecdote. La série redevient ce
-- qu'elle dit être, et l'historique sait enfin distinguer une anecdote lue
-- d'une anecdote seulement reçue — ce qui rend le rattrapage possible, donc
-- affichable, donc récompensable.

-- 1. La colonne.
alter table public.user_anecdote_history
  add column if not exists read_at timestamptz;

comment on column public.user_anecdote_history.read_at is
  'Première ouverture réelle par le lecteur, dans son fuseau. Null = reçue, jamais lue. Jamais écrite par le cron.';

-- Tout l'historique antérieur passe pour lu. Sans ça, la migration elle-même
-- remettrait chaque série à zéro et couvrirait chaque carnet de pastilles :
-- une correction qui punit ceux qu'elle vient corriger. La règle stricte ne
-- vaut qu'à partir d'ici.
update public.user_anecdote_history
   set read_at = sent_at
 where read_at is null;

-- 2. Marquer lu, appelé par l'app à l'affichage.
--
-- `coalesce` rend l'appel idempotent : rouvrir une anecdote ne déplace pas sa
-- date de lecture, sans quoi relire en septembre une anecdote d'août la ferait
-- passer de « lue le jour même » à « rattrapée » et raboterait la série a
-- posteriori.
create or replace function public.marquer_anecdote_lue(p_anecdote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  update public.user_anecdote_history
     set read_at = coalesce(read_at, now())
   where user_id = auth.uid()
     and anecdote_id = p_anecdote_id;
end;
$$;

revoke execute on function public.marquer_anecdote_lue(uuid) from public, anon;
grant execute on function public.marquer_anecdote_lue(uuid) to authenticated;

-- 3. Statistiques : deux colonnes de plus, une source différente.
--
-- Le type de retour change, et `create or replace function` ne sait pas le
-- faire : il faut supprimer d'abord.
drop function if exists public.mes_statistiques();

create function public.mes_statistiques()
returns table (
  serie int,
  record int,
  total_lues int,
  ville text,
  lues_ville int,
  total_ville int,
  non_lues int,
  rattrapees int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_today date;
  v_tz text;
begin
  if v_user is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_user;

  -- « Le jour même » se juge dans le fuseau du profil, pas en UTC : à Paris,
  -- une lecture à 23 h tomberait sinon au lendemain et casserait la série de
  -- quelqu'un qui vient précisément de l'honorer.
  v_tz := coalesce(v_profile.timezone, 'UTC');
  v_today := (now() at time zone v_tz)::date;

  return query
  with vus as (
    select h.anecdote_id,
           h.sent_on,
           h.read_at,
           (h.read_at at time zone v_tz)::date as lu_le
      from public.user_anecdote_history h
     where h.user_id = v_user and h.sent_on is not null
  ),
  -- Seule une lecture faite le jour de l'envoi prolonge la série. Rattraper
  -- une anecdote du 25 août complète le carnet, il ne répare pas le 25 août :
  -- une série qu'on peut reconstituer après coup n'est plus une série.
  jours as (
    select distinct v.sent_on as j
      from vus v
     where v.lu_le = v.sent_on
  ),
  -- Îlots de jours consécutifs. L'écart entre une date et son rang reste
  -- constant tant que les jours se suivent, et saute à chaque interruption :
  -- cet écart identifie donc la série, sans boucle ni récursion.
  ilots as (
    select j, j - (row_number() over (order by j))::int as ilot
      from jours
  ),
  series as (
    select ilot, count(*)::int as longueur, max(j) as fin
      from ilots
     group by ilot
  ),
  lues as (
    select v.anecdote_id, a.city_place_id, a.city
      from vus v
      join public.anecdotes a on a.id = v.anecdote_id
     where v.read_at is not null
  )
  select
    -- Une série reste vivante si le dernier jour lu est aujourd'hui ou hier :
    -- la journée en cours doit compter comme une occasion de la poursuivre,
    -- pas comme une rupture déjà consommée.
    coalesce((select max(longueur) from series where fin >= v_today - 1), 0),
    coalesce((select max(longueur) from series), 0),
    (select count(distinct anecdote_id)::int from lues),
    v_profile.city,
    (select count(distinct l.anecdote_id)::int
       from lues l
      where case
              when v_profile.city_place_id is not null
                then l.city_place_id = v_profile.city_place_id
              else l.city = v_profile.city
            end),
    (select count(*)::int
       from public.anecdotes a
      where a.status = 'validated'
        and case
              when v_profile.city_place_id is not null
                then a.city_place_id = v_profile.city_place_id
              else a.city = v_profile.city
            end),
    -- Le retard, journée en cours exclue : l'anecdote du jour n'est pas en
    -- retard, elle attend simplement d'être ouverte.
    (select count(*)::int
       from vus v
      where v.read_at is null and v.sent_on < v_today),
    -- Ce que le rattrapage récompense : lues, mais après leur jour d'envoi.
    (select count(*)::int
       from vus v
      where v.read_at is not null and v.lu_le > v.sent_on);
end;
$$;

revoke execute on function public.mes_statistiques() from public, anon;
grant execute on function public.mes_statistiques() to authenticated;
