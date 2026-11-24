-- La notification quotidienne part toujours à l'heure choisie, même si la
-- personne a ouvert l'app plus tôt dans la journée.
--
-- Avant : `profiles_a_notifier` écartait quiconque avait déjà une ligne
-- d'historique pour aujourd'hui. Ouvrir l'app le matin réservait l'anecdote,
-- et la notification du soir ne partait plus. Le rendez-vous quotidien
-- disparaissait justement chez les plus assidus.
--
-- Maintenant : l'anti-doublon ne repose plus sur l'historique mais sur une
-- table dédiée, `notifications_quotidiennes`, réservée avant l'envoi. Sa clé
-- primaire garantit une notification par jour au plus, même si deux passages
-- du cron se chevauchent. L'anecdote annoncée reste celle déjà servie dans
-- l'app (`get_daily_anecdote_for` renvoie la même).

create table if not exists public.notifications_quotidiennes (
  user_id uuid not null references auth.users (id) on delete cascade,
  jour date not null,
  anecdote_id uuid not null references public.anecdotes (id) on delete cascade,
  envoye_at timestamptz not null default now(),
  primary key (user_id, jour)
);

-- Aucune politique : seul le service (cron) y touche.
alter table public.notifications_quotidiennes enable row level security;

-- Le type de retour change (ajout de `jour`) : il faut supprimer d'abord.
drop function if exists public.profiles_a_notifier(int);

create function public.profiles_a_notifier(p_window_minutes int default 15)
returns table (user_id uuid, expo_push_token text, jour date)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.id,
           p.expo_push_token,
           p.notification_hour,
           coalesce(p.city_place_id, p.city) as ville,
           (now() at time zone coalesce(p.timezone, 'UTC')) as heure_locale
      from public.profiles p
  )
  select b.id, b.expo_push_token, b.heure_locale::date
    from base b
   where b.expo_push_token is not null
     and b.ville is not null
     and mod(
           (extract(epoch from b.heure_locale::time)::int
            - extract(epoch from b.notification_hour)::int) / 60 + 1440,
           1440
         ) < p_window_minutes
     -- Déjà notifié aujourd'hui. Avoir ouvert l'app ne compte pas.
     and not exists (
       select 1 from public.notifications_quotidiennes n
        where n.user_id = b.id and n.jour = b.heure_locale::date
     );
$$;
revoke execute on function public.profiles_a_notifier(int) from public, anon, authenticated;
grant execute on function public.profiles_a_notifier(int) to service_role;
