-- Alerte email sur les retours des lecteurs.
--
-- `feedback` recueille corrections et propositions depuis l'origine, et rien
-- ne la lisait. Demander à quelqu'un de contribuer puis ne jamais relever sa
-- contribution est la meilleure façon de le faire renoncer.

-- 1. Ce qui a déjà été signalé. Nullable : les retours antérieurs restent à
--    signaler, ils partiront au premier envoi.
alter table public.feedback
  add column if not exists notified_at timestamptz;

-- Index partiel : la file des retours en attente est toujours minuscule
-- comparée à l'historique, et c'est la seule chose qu'on interroge.
create index if not exists feedback_a_signaler_idx
  on public.feedback (created_at)
  where notified_at is null;

-- 2. La file, enrichie de l'auteur et de l'anecdote concernée.
--    security definer : `auth.users` n'est pas lisible autrement, et l'adresse
--    de l'auteur est ce qui permet de lui répondre.
create or replace function public.retours_a_signaler(p_limit int default 25)
returns table (
  id uuid,
  type text,
  comment text,
  created_at timestamptz,
  auteur text,
  anecdote_titre text,
  anecdote_ville text
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
         a.city
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

-- 3. Déclencheur immédiat.
create or replace function public.declencher_alerte_retours()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'anecto_functions_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'anecto_admin_secret';

  if v_url is null or v_secret is null then
    raise exception 'Secrets anecto_functions_url / anecto_admin_secret absents de Vault';
  end if;

  select net.http_post(
           url := v_url || '/notify-feedback',
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'x-anecto-admin-secret', v_secret
           ),
           body := '{}'::jsonb,
           timeout_milliseconds := 30000
         ) into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function public.declencher_alerte_retours() from public, anon, authenticated;

-- 4. Le trigger. Il avale ses propres erreurs : un envoi d'alerte qui échoue
--    ne doit jamais empêcher quelqu'un de déposer sa contribution — ce serait
--    perdre la chose même qu'on cherche à ne pas perdre. Le cron rattrapera.
create or replace function public.feedback_apres_insertion()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  begin
    perform public.declencher_alerte_retours();
  exception when others then
    raise warning 'Alerte retour non déclenchée : %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists feedback_alerte on public.feedback;
create trigger feedback_alerte
  after insert on public.feedback
  for each row execute function public.feedback_apres_insertion();
