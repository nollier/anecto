-- Réponse aux retours des lecteurs, sur validation humaine.
--
-- `notify-feedback` alerte déjà sur chaque retour, mais rien ne permet d'y
-- répondre : la personne qui a pris le temps d'écrire n'a jamais de
-- nouvelles. Ce qui suit ajoute un brouillon (généré par IA, dans la
-- fonction) et un jeton à usage unique pour l'envoyer -- jamais
-- automatiquement, toujours sur un clic humain dans le mail d'alerte.

alter table public.feedback
  add column if not exists reponse_brouillon text,
  add column if not exists reponse_token uuid not null default gen_random_uuid(),
  add column if not exists reponse_envoyee_at timestamptz;

create unique index if not exists feedback_reponse_token_idx
  on public.feedback (reponse_token);

-- `retours_a_signaler` doit maintenant aussi porter le brouillon et le jeton
-- jusqu'à `notify-feedback`. Le type de retour change : il faut la
-- supprimer avant de la recréer.
drop function if exists public.retours_a_signaler(int);

create function public.retours_a_signaler(p_limit int default 25)
returns table (
  id uuid,
  type text,
  comment text,
  created_at timestamptz,
  auteur text,
  anecdote_titre text,
  anecdote_ville text,
  reponse_brouillon text,
  reponse_token uuid
)
language sql
security definer
set search_path = public
as $$
  select f.id,
         f.type,
         f.comment,
         f.created_at,
         u.email::text,
         a.title,
         a.city,
         f.reponse_brouillon,
         f.reponse_token
    from public.feedback f
    left join auth.users u on u.id = f.user_id
    left join public.anecdotes a on a.id = f.anecdote_id
   where f.notified_at is null
     -- « J'adore » sans commentaire n'apprend rien et noierait le reste.
     and (f.type <> 'adore' or coalesce(f.comment, '') <> '')
   order by f.created_at
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.retours_a_signaler(int) from public, anon, authenticated;
grant execute on function public.retours_a_signaler(int) to service_role;

-- Lecture par jeton, depuis le lien du mail : `auth.users` n'est pas
-- exposée autrement, et c'est l'adresse de l'auteur qui permet de lui
-- répondre.
create or replace function public.feedback_par_token(p_token uuid)
returns table (
  id uuid,
  auteur text,
  type text,
  comment text,
  reponse_brouillon text,
  reponse_envoyee_at timestamptz,
  anecdote_titre text,
  anecdote_ville text
)
language sql
security definer
set search_path = public
as $$
  select f.id,
         u.email::text,
         f.type,
         f.comment,
         f.reponse_brouillon,
         f.reponse_envoyee_at,
         a.title,
         a.city
    from public.feedback f
    left join auth.users u on u.id = f.user_id
    left join public.anecdotes a on a.id = f.anecdote_id
   where f.reponse_token = p_token;
$$;

revoke execute on function public.feedback_par_token(uuid) from public, anon, authenticated;
grant execute on function public.feedback_par_token(uuid) to service_role;
