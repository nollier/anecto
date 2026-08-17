-- Série et carnet : ce qui donne envie de revenir demain.
--
-- Rien de nouveau n'est stocké. Tout se déduit de `user_anecdote_history`,
-- qui enregistre déjà une ligne par jour et par lecteur depuis l'origine —
-- c'est le seul mécanisme de fidélisation qu'on puisse ajouter sans créer la
-- moindre dette de contenu.

create or replace function public.mes_statistiques()
returns table (
  serie int,
  record int,
  total_lues int,
  ville text,
  lues_ville int,
  total_ville int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_today date;
begin
  if v_user is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_user;
  v_today := (now() at time zone coalesce(v_profile.timezone, 'UTC'))::date;

  return query
  with jours as (
    select distinct h.sent_on as j
      from public.user_anecdote_history h
     where h.user_id = v_user and h.sent_on is not null
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
    select h.anecdote_id, a.city_place_id, a.city
      from public.user_anecdote_history h
      join public.anecdotes a on a.id = h.anecdote_id
     where h.user_id = v_user
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
            end);
end;
$$;

revoke execute on function public.mes_statistiques() from public, anon;
grant execute on function public.mes_statistiques() to authenticated;
