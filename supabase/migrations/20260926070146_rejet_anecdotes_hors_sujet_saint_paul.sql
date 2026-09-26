-- Quatre anecdotes rattachées à Saint-Paul (La Réunion) qui parlent d'autres
-- lieux : trois du Vatican (chapelle Sixtine, chapelle Pauline, basilique
-- Saint-Paul-hors-les-Murs), une de Cordes-sur-Ciel. Le nom de la ville a
-- suffi à tirer des articles homonymes dans le dossier documentaire, et la
-- vérification, qui contrôle les citations et non le lieu, les a laissées
-- passer.
--
-- Rejetées plutôt que supprimées : trois ont déjà été envoyées, et
-- l'historique des lecteurs les référence. L'historique masque d'office une
-- anecdote qui n'est plus validée.

update public.anecdotes
   set status = 'rejected'
 where id in (
   'd8b1da20-c2c6-4af3-a158-40a52dbaedfb', -- La chapelle des conclaves
   '4fdb3d3f-b69e-43d8-b3dc-1430ed045802', -- La chapelle interdite
   '181508b0-b95b-46e6-8b8c-5d753a57f916', -- La fin du monde en médaillons
   '924cc8ae-2913-4ef9-aff7-83c9f2270e28'  -- Le fauconnier de Cordes
 )
   and city = 'Saint-Paul'
   and status = 'validated';
