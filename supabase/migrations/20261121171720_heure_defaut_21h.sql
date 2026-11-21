-- Heure de notification par défaut des nouveaux comptes : retour à 21 h.
alter table public.profiles alter column notification_hour set default '21:00';
