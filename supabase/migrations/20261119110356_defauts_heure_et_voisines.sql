-- Valeurs par défaut des nouveaux comptes : notification à 12 h 15 et
-- anecdotes des villes voisines activées.
alter table public.profiles alter column notification_hour set default '12:15';
alter table public.profiles alter column villes_voisines set default true;

-- Les comptes qui n'ont jamais répondu (null) passent à « activé ». Un
-- « non » explicite (false) est conservé.
update public.profiles set villes_voisines = true where villes_voisines is null;
