-- Changer de ville doit changer l'anecdote du jour, sans attendre minuit.
--
-- `get_daily_anecdote_for` commençait par « une anecdote a-t-elle déjà été
-- servie aujourd'hui ? » et renvoyait celle-là sans vérifier qu'elle
-- correspondait encore à la ville du profil. Quelqu'un qui passait de Rennes à
-- Arles continuait donc de lire du Rennes jusqu'au lendemain — une anecdote
-- d'une ville qu'il ne suit plus, sur un écran dont c'est tout le propos.
--
-- La ligne d'historique du jour est désormais réécrite plutôt que conservée :
-- l'index unique (user_id, sent_on) impose une anecdote par jour, et c'est
-- toujours vrai — c'est simplement la dernière qui fait foi.

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

  select * into v_profile from public.profiles where id = p_user;
  if not found or coalesce(v_profile.city_place_id, v_profile.city) is null then
    return null;
  end if;

  v_today := (now() at time zone coalesce(v_profile.timezone, 'UTC'))::date;

  -- Déjà servie aujourd'hui **et toujours dans la ville du profil** : on
  -- renvoie la même. Le rituel reste quotidien, rouvrir l'app ne consomme pas
  -- une anecdote de plus.
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

  -- Ville sans contenu : on laisse l'historique du jour tel quel. Revenir à
  -- l'ancienne ville y retrouvera son anecdote, plutôt que d'en consommer une
  -- deuxième.
  if not found then
    return null;
  end if;

  insert into public.user_anecdote_history (user_id, anecdote_id, sent_on)
  values (p_user, v_anecdote.id, v_today)
  on conflict (user_id, sent_on)
  do update set anecdote_id = excluded.anecdote_id,
                sent_at = now();

  update public.anecdotes set reuse_count = reuse_count + 1 where id = v_anecdote.id;
  v_anecdote.reuse_count := v_anecdote.reuse_count + 1;
  return v_anecdote;
end;
$$;

revoke execute on function public.get_daily_anecdote_for(uuid) from public, anon, authenticated;
grant execute on function public.get_daily_anecdote_for(uuid) to service_role;
