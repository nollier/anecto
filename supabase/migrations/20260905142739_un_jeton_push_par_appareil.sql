-- Un jeton push appartient à un appareil, donc à un seul compte.
--
-- Le jeton Expo identifie un téléphone, pas une personne. Il était écrit sur
-- le profil du compte connecté, sans jamais être retiré des précédents : trois
-- comptes utilisés sur le même téléphone portaient le même jeton. Chacun a son
-- heure et sa ville, si bien que l'appareil recevait les notifications des
-- trois — mesuré en base : un profil Saint-Malo réglé à 7 h 30 recevant à
-- 16 h 15 l'anecdote du profil Versailles.
--
-- Le désordre ne s'arrête pas à la notification. Le cron sert réellement
-- l'anecdote du profil fantôme : elle entre dans son historique, son compteur
-- de réemploi s'incrémente, et son stock s'épuise pour personne.
--
-- Rien ne pouvait se régler côté client : RLS n'autorise chacun à écrire que
-- sa propre ligne, et retirer le jeton des autres comptes suppose d'y toucher.

-- 1. Prendre le jeton, et le retirer à qui l'avait.
create or replace function public.enregistrer_jeton_push(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  if coalesce(trim(p_token), '') = '' then
    raise exception 'Jeton vide';
  end if;

  -- L'ordre compte : on libère d'abord, on s'attribue ensuite. L'inverse
  -- effacerait le jeton qu'on vient d'écrire.
  update public.profiles
     set expo_push_token = null,
         updated_at = now()
   where expo_push_token = trim(p_token)
     and id <> auth.uid();

  update public.profiles
     set expo_push_token = trim(p_token),
         updated_at = now()
   where id = auth.uid();
end;
$$;

revoke execute on function public.enregistrer_jeton_push(text) from public, anon;
grant execute on function public.enregistrer_jeton_push(text) to authenticated;

-- 2. Rendre le jeton en se déconnectant.
--
-- Sans ça, se déconnecter laisse le compte recevoir des notifications sur un
-- téléphone où personne n'est plus connecté — jusqu'à ce qu'un autre compte
-- réclame le jeton, ce qui peut ne jamais arriver.
create or replace function public.oublier_jeton_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  update public.profiles
     set expo_push_token = null,
         updated_at = now()
   where id = auth.uid();
end;
$$;

revoke execute on function public.oublier_jeton_push() from public, anon;
grant execute on function public.oublier_jeton_push() to authenticated;

-- 3. Réparer l'existant.
--
-- Pour chaque jeton porté par plusieurs profils, seul le plus récemment
-- modifié le garde : c'est le compte avec lequel l'appareil s'est connecté en
-- dernier, le seul dont le propriétaire attend des notifications. Les autres
-- le retrouveront en se reconnectant.
with doublons as (
  select id,
         row_number() over (partition by expo_push_token order by updated_at desc) as rang
    from public.profiles
   where expo_push_token is not null
)
update public.profiles p
   set expo_push_token = null,
       updated_at = now()
  from doublons d
 where p.id = d.id
   and d.rang > 1;
