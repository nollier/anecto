-- « Vrai ou faux ? » avant l'anecdote du jour.
--
-- Une affirmation courte liée à l'anecdote, et sa réponse. Remplies à la main
-- par l'équipe (scripts/quiz.mjs), jamais générées en masse. Sans
-- affirmation, l'anecdote s'affiche comme avant.

-- 1. Les deux champs, ensemble ou pas du tout.
alter table public.anecdotes
  add column if not exists quiz_affirmation text,
  add column if not exists quiz_reponse boolean;

alter table public.anecdotes drop constraint if exists anecdotes_quiz_complet;
alter table public.anecdotes
  add constraint anecdotes_quiz_complet check (
    (quiz_affirmation is null and quiz_reponse is null)
    or (quiz_affirmation is not null and quiz_reponse is not null
        and char_length(trim(quiz_affirmation)) between 10 and 200)
  );

comment on column public.anecdotes.quiz_affirmation is
  'Affirmation « Vrai ou faux ? » montrée avant l''anecdote. L''anecdote donne l''explication.';
comment on column public.anecdotes.quiz_reponse is 'true = l''affirmation est vraie.';

-- 2. Les réponses des lecteurs. La première réponse compte, une seule par
-- anecdote : rouvrir l'app ne permet pas de se corriger.
create table if not exists public.quiz_reponses (
  user_id uuid not null references auth.users (id) on delete cascade,
  anecdote_id uuid not null references public.anecdotes (id) on delete cascade,
  reponse boolean not null,
  juste boolean not null,
  repondu_at timestamptz not null default now(),
  primary key (user_id, anecdote_id)
);

alter table public.quiz_reponses enable row level security;

-- Chacun relit ses réponses. L'écriture passe par `repondre_quiz`, qui juge
-- la réponse côté serveur : le client ne peut pas se déclarer « juste ».
drop policy if exists "Chacun lit ses réponses au quiz" on public.quiz_reponses;
create policy "Chacun lit ses réponses au quiz"
  on public.quiz_reponses for select to authenticated
  using (user_id = auth.uid());

-- 3. Le score : bonnes réponses au total, série en cours (bonnes réponses
-- d'affilée depuis la dernière erreur) et record. « Passer » ne crée pas de
-- ligne, donc ne casse pas la série.
create or replace function public.mes_scores_quiz()
returns table (repondus int, bonnes int, serie int, record int)
language sql
stable
security definer
set search_path = public
as $$
  -- `rows` et non le cadre par défaut : deux réponses de même horodatage ne
  -- doivent pas tomber dans le même groupe (trouvé en test : la série restait
  -- à 1 après une erreur).
  with r as (
    select juste,
           count(*) filter (where not juste)
             over (order by repondu_at, anecdote_id rows between unbounded preceding and current row) as groupe
      from public.quiz_reponses
     where user_id = auth.uid()
  ),
  dernier as (select max(groupe) as g from r)
  select
    (select count(*)::int from r),
    (select count(*) filter (where juste)::int from r),
    coalesce((select count(*) filter (where juste)::int from r, dernier where r.groupe = dernier.g), 0),
    coalesce((select max(n) from (select count(*) filter (where juste)::int as n from r group by groupe) s), 0);
$$;

revoke execute on function public.mes_scores_quiz() from public, anon;
grant execute on function public.mes_scores_quiz() to authenticated;

-- 4. Répondre. Seulement pour une anecdote servie au lecteur et munie d'un
-- quiz. Rend si la réponse est juste, puis les scores à jour.
create or replace function public.repondre_quiz(p_anecdote_id uuid, p_reponse boolean)
returns table (juste boolean, repondus int, bonnes int, serie int, record int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonne boolean;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;
  if p_reponse is null then
    raise exception 'Réponse manquante';
  end if;

  select a.quiz_reponse into v_bonne
    from public.anecdotes a
    join public.user_anecdote_history h on h.anecdote_id = a.id and h.user_id = auth.uid()
   where a.id = p_anecdote_id;

  if v_bonne is null then
    raise exception 'Pas de quiz pour cette anecdote';
  end if;

  insert into public.quiz_reponses (user_id, anecdote_id, reponse, juste)
  values (auth.uid(), p_anecdote_id, p_reponse, p_reponse = v_bonne)
  on conflict (user_id, anecdote_id) do nothing;

  return query
  select q.juste, s.repondus, s.bonnes, s.serie, s.record
    from public.quiz_reponses q, public.mes_scores_quiz() s
   where q.user_id = auth.uid() and q.anecdote_id = p_anecdote_id;
end;
$$;

revoke execute on function public.repondre_quiz(uuid, boolean) from public, anon;
grant execute on function public.repondre_quiz(uuid, boolean) to authenticated;
