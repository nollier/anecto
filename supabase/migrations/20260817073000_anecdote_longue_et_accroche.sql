-- L'anecdote devient un récit, et gagne une accroche.
--
-- Avant : un titre de 2 à 6 mots servait à la fois d'étiquette pour la
-- notification et de titre à l'écran, au-dessus d'un paragraphe de 60 à 110
-- mots. Le format visé est maintenant une histoire de 300 à 450 mots
-- introduite par une phrase d'accroche.
--
-- Les deux ne peuvent pas être le même champ : la notification quotidienne
-- affiche « Aujourd'hui, on découvre « <titre> » », où une accroche de vingt
-- mots serait tronquée par le système. `title` reste donc court et sert la
-- notification et la file de relecture ; `hook` porte la phrase affichée.

alter table public.anecdotes
  add column if not exists hook text;

comment on column public.anecdotes.hook is
  'Phrase d''accroche affichée en titre dans l''app. `title` reste l''étiquette courte de la notification.';

-- 450 mots de français dépassent les 3000 caractères d'origine.
alter table public.anecdotes
  drop constraint if exists anecdotes_body_check;

alter table public.anecdotes
  add constraint anecdotes_body_check
  check (char_length(body) >= 50 and char_length(body) <= 4000);

-- La file de relecture doit montrer l'accroche : c'est la phrase la plus lue
-- de l'écran, donc celle qu'un relecteur doit contrôler en premier.
-- Recréée plutôt que remplacée : `create or replace view` n'autorise l'ajout
-- de colonnes qu'en fin de liste, et l'accroche se lit après le titre.
drop view if exists public.anecdotes_a_valider;

create view public.anecdotes_a_valider
with (security_invoker = on) as
select a.id,
       a.city,
       a.title,
       a.hook,
       a.period,
       a.body,
       char_length(a.body) as body_chars,
       a.source_url,
       a.sources,
       a.confidence,
       a.verification_notes,
       a.generated_by,
       a.created_at
  from public.anecdotes a
 where a.status = 'draft'
 order by case a.confidence
            when 'haute' then 1
            when 'moyenne' then 2
            else 3
          end,
          a.created_at;

revoke all on public.anecdotes_a_valider from anon, authenticated;
