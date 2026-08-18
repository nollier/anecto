-- L'historique ne doit rien oublier.
--
-- `get_daily_anecdote_for` réécrivait la ligne du jour (`on conflict
-- (user_id, sent_on) do update`) quand quelqu'un changeait de ville en cours
-- de journée. L'anecdote lue avant le changement disparaissait alors de
-- l'historique — et l'unicité (user_id, anecdote_id), qui garantit qu'une
-- anecdote n'est jamais servie deux fois, ne protège que ce qu'elle voit.
-- Mesuré en base avant correction : une anecdote servie, absente de
-- l'historique, donc éligible à un second envoi.
--
-- L'historique redevient un journal : on n'y remplace plus jamais une ligne.
-- La règle « une anecdote par jour » cesse d'être un index unique — elle
-- n'était de toute façon plus vraie depuis qu'un changement de ville en sert
-- légitimement une seconde — et devient une règle de la fonction, qui rend
-- l'anecdote déjà servie tant que la ville n'a pas changé.

-- 1. L'unicité par jour disparaît, l'index de recherche reste.
drop index if exists public.user_anecdote_history_user_day_key;

create index if not exists user_anecdote_history_user_day_idx
  on public.user_anecdote_history (user_id, sent_on);

-- `unique (user_id, anecdote_id)` est conservé : c'est lui, et lui seul, qui
-- interdit de servir deux fois la même anecdote.

-- 2. Sélection du jour, sans réécriture.
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

  -- Deux appareils qui ouvrent l'app en même temps tiraient chacun leur
  -- anecdote. Le verrou les sérialise : le second voit ce que le premier a
  -- écrit, et renvoie la même.
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select * into v_profile from public.profiles where id = p_user;
  if not found or coalesce(v_profile.city_place_id, v_profile.city) is null then
    return null;
  end if;

  v_today := (now() at time zone coalesce(v_profile.timezone, 'UTC'))::date;

  -- Déjà servie aujourd'hui et toujours dans la ville du profil : on renvoie
  -- la même. Rouvrir l'app ne consomme pas une anecdote de plus.
  select a.* into v_anecdote
    from public.user_anecdote_history h
    join public.anecdotes a on a.id = h.anecdote_id
   where h.user_id = p_user
     and h.sent_on = v_today
     and case
           when v_profile.city_place_id is not null
             then a.city_place_id = v_profile.city_place_id
           else a.city = v_profile.city
         end
   order by h.sent_at desc
   limit 1;

  if found then
    return v_anecdote;
  end if;

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

  if not found then
    return null;
  end if;

  -- Insertion seule, jamais de mise à jour : une ligne écrite ici ne doit
  -- plus jamais disparaître, c'est elle qui interdit un second envoi.
  insert into public.user_anecdote_history (user_id, anecdote_id, sent_on)
  values (p_user, v_anecdote.id, v_today)
  on conflict (user_id, anecdote_id) do nothing;

  update public.anecdotes set reuse_count = reuse_count + 1 where id = v_anecdote.id;
  v_anecdote.reuse_count := v_anecdote.reuse_count + 1;
  return v_anecdote;
end;
$$;

revoke execute on function public.get_daily_anecdote_for(uuid) from public, anon, authenticated;
grant execute on function public.get_daily_anecdote_for(uuid) to service_role;
