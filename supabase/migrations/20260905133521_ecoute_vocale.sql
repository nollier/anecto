-- Compter les écoutes comme on compte les lectures.
--
-- L'anecdote peut désormais être lue à voix haute par le téléphone. La
-- question qui décidera de la suite n'est pas « est-ce que ça marche » mais
-- « est-ce que quelqu'un s'en sert » : un vrai lecteur audio, avec ses
-- fichiers pré-générés, sa lecture en arrière-plan et son coût de synthèse
-- serveur, ne se justifie que si l'écoute prend.
--
-- Rien de nouveau n'est collecté sur personne : c'est une colonne de plus sur
-- une ligne d'historique qui existe déjà, au même titre que `read_at`.

-- 1. La colonne.
alter table public.user_anecdote_history
  add column if not exists ecoutee_le timestamptz;

comment on column public.user_anecdote_history.ecoutee_le is
  'Première écoute vocale par le lecteur. Null = jamais écoutée. Écrite par l''app au démarrage de la voix, jamais par le cron.';

-- Aucune reprise de l'historique existant, contrairement à `read_at` : une
-- anecdote d'avant l'écoute n'a pas été écoutée, et la faire passer pour telle
-- fausserait dès le premier jour la mesure que cette colonne existe pour
-- rendre possible.

-- 2. Marquer écouté, appelé par l'app au démarrage de la synthèse.
--
-- `coalesce` rend l'appel idempotent, comme pour la lecture : réécouter une
-- anecdote ne déplace pas la date, et l'anecdote reste comptée une fois.
create or replace function public.marquer_anecdote_ecoutee(p_anecdote_id uuid)
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
     set ecoutee_le = coalesce(ecoutee_le, now())
   where user_id = auth.uid()
     and anecdote_id = p_anecdote_id;
end;
$$;

revoke execute on function public.marquer_anecdote_ecoutee(uuid) from public, anon;
grant execute on function public.marquer_anecdote_ecoutee(uuid) to authenticated;
