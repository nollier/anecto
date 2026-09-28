-- Relecture des brouillons de Saint-Chamond et de Bénodet, tous au verdict
-- « doute ». Déjà appliquée en base le 28/09 ; rejouable sans effet.
--
-- Saint-Chamond : quatre anecdotes publiées. Sept rejetées : cinq parlent
-- d'autres lieux (BnF, Saint-Chamant, Fontaine, deux gares de Saint-Étienne)
-- et deux présentent l'aqueduc du Gier comme captant une source, ce que leur
-- propre source contredit.
--
-- Bénodet : les huit brouillons partent d'articles génériques (dolmen, menhir,
-- sémaphore, croix de guerre...) et y ajoutent des détails locaux absents du
-- dossier. Tous rejetés.
--
-- La demande de Saint-Chamond a été notifiée à la main avec quatre anecdotes,
-- sous le seuil de cinq de `demandes_a_prevenir`, qui n'a pas été modifié.

update public.anecdotes
   set status = 'validated'
 where id in (
   '1f408704-da49-439f-9aae-1de672f03f74', -- L'aqueduc oublié
   'dae2dcec-4549-42d5-be9e-e602afb66df1', -- La pierre qui protégeait l'eau
   'ce911a25-7ed5-4480-984a-dfb17ce34c32', -- Le lacet qui fit la ville
   '593cdd6d-78e7-4e40-ac1d-d879e21473df'  -- Le premier train de 1832
 )
   and status = 'draft';

update public.anecdotes
   set status = 'rejected'
 where id in (
   '28d88bf8-04ee-4951-8d1a-418dab209b2d', -- La gare qui se relève
   '7c1af7de-990f-48b2-828e-632588f438fc', -- L'aqueduc qui traversait le Gier
   'bbe4c0c5-5588-43ef-a149-73d0ba7dd280', -- L'eau du Gier pour Lyon
   '3f2adb6f-ee3d-4cf8-8db7-ae0aa146a6af', -- Le dépôt légal de François Ier
   '50800829-c99d-46e5-81d5-52be8a8f259f', -- La collégiale de Saint-Chamant
   'a69fb47b-d273-4ef3-9bae-acdbc3706b2d', -- Le Drac dompté à Fontaine
   '96795d8e-0e89-4315-9145-1234f8d23aee', -- La gare des Mottetières
   '6ebe2392-ffd7-4a5d-80e0-7535e7293bac', -- La table de pierre
   '578c3054-40d7-4f43-9ac5-ce1afc3799c1', -- La batterie oubliée de Bénodet
   '9cf96896-4add-4a1b-9a81-3b7514b4eeb5', -- La croix des villes décorées
   'b7c838b9-730d-4dec-a24f-f1955181dab6', -- La pierre longue de Bénodet
   'a8d2d05d-549b-42ae-b462-e78fa0db956c', -- Le dépôt légal de 1536
   '87ae2f7b-bdfd-4bf6-9c36-4a57949cfdaf', -- Le sémaphore de Bénodet
   '0f34325d-5aa5-46ba-b6ad-08667d6e2962', -- Le ruban vert et noir
   '6c4d5c64-73d8-4e04-aebc-5e752b39db19'  -- Le monument aux morts de Bénodet
 )
   and status = 'draft';
