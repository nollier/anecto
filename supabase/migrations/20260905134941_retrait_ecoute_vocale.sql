-- Retrait de la lecture à voix haute.
--
-- La synthèse du téléphone rend une voix robotique, sans souffle ni ponctuation
-- audible. Sur un texte de trois minutes qu'on écoute pour le plaisir de la
-- langue, c'est disqualifiant : mieux vaut pas d'écoute du tout qu'une écoute
-- qui abîme l'anecdote. L'idée n'est pas abandonnée, elle attend une vraie
-- voix, achetée à un fournisseur et pré-générée par anecdote — ce qui sera un
-- autre schéma, avec un fichier audio et sa durée, pas une date d'écoute.
--
-- La colonne n'a jamais servi qu'à mesurer une fonctionnalité qui n'existe
-- plus. La garder, c'est laisser le schéma décrire une app qui n'est pas
-- celle qu'on livre.

drop function if exists public.marquer_anecdote_ecoutee(uuid);

alter table public.user_anecdote_history
  drop column if exists ecoutee_le;
