-- Durcissement avant publication sur les magasins.
--
-- Quatre points relevés par l'analyseur de sécurité Supabase et par la
-- relecture des politiques RLS.

-- 1. Le corpus n'est plus lisible sans compte.
--
-- La politique d'origine ouvrait la lecture des anecdotes validées au rôle
-- `public`, donc à `anon`. Tant qu'il n'y avait rien en base, c'était sans
-- portée. Avec 552 anecdotes, n'importe qui muni de la clé publiable — qui est
-- par nature extractible du bundle — pouvait aspirer l'intégralité du travail
-- éditorial en une requête. L'app exige déjà une session pour afficher quoi
-- que ce soit : restreindre à `authenticated` ne retire aucune fonction.
drop policy if exists "Anyone can read validated anecdotes" on public.anecdotes;

create policy "Les comptes connectés lisent les anecdotes validées"
  on public.anecdotes for select
  to authenticated
  using (status = 'validated');

-- 2. Le client n'écrit plus l'historique.
--
-- Cette politique datait de l'époque où l'app choisissait elle-même son
-- anecdote. Depuis, `get_daily_anecdote()` écrit l'historique en
-- security definer. La politique ne servait donc plus qu'à laisser quelqu'un
-- inscrire de fausses lectures — pour gonfler sa série, ou pour sauter des
-- anecdotes qu'il n'a pas lues.
drop policy if exists "Users insert own history" on public.user_anecdote_history;

-- 3. Une fonction de trigger n'a rien à faire dans l'API REST.
--
-- `feedback_apres_insertion` est appelée par le trigger, jamais par un client.
-- Laissée aux droits par défaut, elle était exposée en
-- /rest/v1/rpc/feedback_apres_insertion et permettait à n'importe qui de
-- déclencher des requêtes sortantes en boucle.
revoke execute on function public.feedback_apres_insertion() from public, anon, authenticated;

-- 4. search_path figé sur le dernier trigger qui en manquait.
create or replace function public.set_validated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'validated' and (tg_op = 'INSERT' or old.status is distinct from 'validated') then
    new.validated_at := now();
  elsif new.status <> 'validated' then
    new.validated_at := null;
  end if;
  return new;
end;
$$;
