-- L'heure de l'annonce (push + email) peut différer de l'ouverture du vote :
-- le vote est visible et ouvert dans l'app avant que l'annonce parte.
alter table public.campagnes_vote add column if not exists annonce_at timestamptz;

comment on column public.campagnes_vote.annonce_at is
  'Heure d''envoi du push et de l''email. Null = à l''ouverture du vote (debut).';

create or replace function public.annonces_vote_a_envoyer(p_canal text, p_limit int)
returns table (campagne_id uuid, user_id uuid, destination text)
language sql stable security definer set search_path = public, auth
as $$
  with c as (
    select id, coalesce(annonce_at, debut) as annonce
    from public.campagnes_vote
    where now() >= coalesce(annonce_at, debut) and now() < fin
    limit 1
  )
  select c.id, p.id,
         case when p_canal = 'push' then p.expo_push_token else u.email end
  from c
  join public.profiles p on p.created_at < c.annonce
  join auth.users u on u.id = p.id
  where (
      (p_canal = 'push' and p.expo_push_token is not null)
      or (p_canal = 'email' and u.email is not null and p.annonces_email)
    )
    and not exists (
      select 1 from public.annonces_vote a
      where a.campagne_id = c.id and a.user_id = p.id and a.canal = p_canal
    )
  order by p.created_at
  limit p_limit;
$$;

revoke execute on function public.annonces_vote_a_envoyer(text, int) from public, anon, authenticated;
grant execute on function public.annonces_vote_a_envoyer(text, int) to service_role;

-- Vote n°1 : ouvert dans l'app dès maintenant, annonce ce soir à 18 h.
update public.campagnes_vote
set annonce_at = '2026-11-21 18:00:00 Europe/Paris', debut = now()
where numero = 1 and debut > now();
