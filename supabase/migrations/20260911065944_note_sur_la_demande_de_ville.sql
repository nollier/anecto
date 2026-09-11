-- Dire au lecteur ce qu'on a ouvert quand ce n'est pas ce qu'il a demandé.
--
-- Saint-Gilles-les-Bains a été demandé le 9 septembre. Ce n'est pas une
-- commune mais un quartier de Saint-Paul, à La Réunion : Wikipédia lui
-- consacre un article de deux mille caractères, sans un seul monument, et le
-- dossier documentaire revient vide. La ville est incouvrable telle quelle,
-- alors que Saint-Paul, qui l'englobe, a de quoi tenir des semaines.
--
-- Ouvrir Saint-Paul et envoyer « Saint-Paul est prête » à quelqu'un qui a
-- écrit Saint-Gilles, c'est répondre à côté sans le dire. La note porte
-- l'explication, à côté de la ville, et le mail la rend telle quelle.
--
-- Volontairement une colonne libre et non une table de motifs : le cas est
-- rare, et chaque substitution s'explique différemment.

alter table public.demandes_ville
  add column if not exists note text;

comment on column public.demandes_ville.note is
  'Phrase ajoutée au mail « ta ville est prête » quand on a ouvert autre chose que ce qui était demandé (quartier rattaché à sa commune, homonyme, orthographe). Null dans le cas normal.';

-- La note voyage avec la demande : `notify-city-ready` groupe par
-- destinataire et n'a que ce que cette fonction lui rend.
--
-- Recréée plutôt que remplacée : `create or replace function` refuse un
-- changement de type de retour.
drop function if exists public.demandes_a_prevenir(int);

create function public.demandes_a_prevenir(p_limit int default 100)
returns table (id uuid, email text, ville text, note text)
language sql
security definer
set search_path = public
as $$
  select d.id, u.email::text, d.ville, d.note
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
