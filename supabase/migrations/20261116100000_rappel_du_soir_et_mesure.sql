-- Rappel du soir, et journal des événements de mesure.
--
-- 89 % des nouveaux lisent le jour de l'inscription, 27 % reviennent le
-- lendemain. Deux leviers ici : un rappel push le soir même quand l'anecdote
-- du jour n'a pas été ouverte, et de quoi mesurer ce qui marche.

-- 1. Journal des événements.
--
-- Une table plutôt qu'un outil d'analytics : aucune dépendance payante, et
-- les chiffres se croisent directement avec l'historique de lecture. La liste
-- des types est fermée : une coquille côté app échoue au lieu de créer une
-- catégorie fantôme.
create table if not exists public.evenements (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in (
    'rappel_envoye',
    'ouverture_push',
    'demande_notif_affichee',
    'demande_notif_acceptee',
    'demande_notif_refusee',
    'connu_par_repondu',
    'connu_par_passe',
    'partage_propose',
    'partage_lance',
    'partage_confirme',
    'quiz_affiche',
    'quiz_repondu',
    'quiz_passe',
    'quiz_partage'
  )),
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.evenements enable row level security;

create index if not exists evenements_type_date_idx on public.evenements (type, created_at desc);
create index if not exists evenements_user_idx on public.evenements (user_id);

-- Comme `feedback` : chacun écrit ses propres lignes, personne ne relit
-- depuis l'app. Les chiffres se lisent côté serveur.
drop policy if exists "Chacun note ses propres événements" on public.evenements;
create policy "Chacun note ses propres événements"
  on public.evenements for insert to authenticated
  with check (user_id = auth.uid());

-- 2. Un rappel par jour et par lecteur, au plus.
--
-- La clé primaire le garantit, quel que soit le nombre de passages du cron :
-- la fonction réserve la ligne avant d'envoyer, et n'envoie que si elle l'a
-- obtenue. `jour` est le jour d'envoi de l'anecdote rappelée.
create table if not exists public.rappels_push (
  user_id uuid not null references auth.users (id) on delete cascade,
  jour date not null,
  anecdote_id uuid not null references public.anecdotes (id) on delete cascade,
  envoye_at timestamptz not null default now(),
  primary key (user_id, jour)
);

-- Aucune politique : seul le service (cron) y touche.
alter table public.rappels_push enable row level security;

-- 3. L'heure du rappel du soir, pour une heure de notification donnée.
--
-- Trois heures après la notification, jamais après 21 h 30. Une notification
-- entre 18 h 30 et 20 h se rappelle à 21 h 30 (au moins 1 h 30 d'écart).
-- Au-delà de 20 h, le soir n'a plus la place : nul, le rappel passe au
-- lendemain matin (voir `heure_rappel_matin`). Jamais avant 8 h non plus,
-- pour les rares notifications réglées en pleine nuit.
create or replace function public.heure_rappel_soir(p_notif time)
returns time
language sql
immutable
as $$
  select case
           when p_notif <= time '18:30' then greatest(p_notif + interval '3 hours', time '08:00')
           when p_notif <= time '20:00' then time '21:30'
           else null
         end;
$$;

-- Le lendemain matin, pour les notifications du soir tardif.
create or replace function public.heure_rappel_matin(p_notif time)
returns time
language sql
immutable
as $$
  select case when p_notif > time '20:00' then time '09:00' else null end;
$$;

-- 4. Qui rappeler maintenant.
--
-- Un rappel n'est dû que si :
--   - l'anecdote du jour visé a été servie et n'est pas ouverte ;
--   - rien n'a été lu depuis qu'elle a été servie (un rattrapage dans
--     l'historique compte : le lecteur est revenu) ;
--   - les trois jours précédents ne sont pas tous restés sans lecture. Après
--     trois rappels sans effet, on se tait : la relance email (relance-retard)
--     prend le relais à cinq anecdotes en retard.
create or replace function public.rappels_a_envoyer(p_window_minutes int default 15)
returns table (user_id uuid, expo_push_token text, jour date, anecdote_id uuid, ville text)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select p.id,
           p.expo_push_token,
           p.notification_hour,
           (now() at time zone coalesce(p.timezone, 'UTC')) as heure_locale
      from public.profiles p
     where p.expo_push_token is not null
       and coalesce(p.city_place_id, p.city) is not null
  ),
  creneaux as (
    -- Rappel du soir : l'anecdote d'aujourd'hui.
    select b.id, b.expo_push_token, b.heure_locale::date as jour,
           public.heure_rappel_soir(b.notification_hour) as cible, b.heure_locale
      from base b
    union all
    -- Rappel du matin : l'anecdote d'hier, quand le soir était trop tard.
    select b.id, b.expo_push_token, b.heure_locale::date - 1,
           public.heure_rappel_matin(b.notification_hour), b.heure_locale
      from base b
  )
  select c.id, c.expo_push_token, c.jour, h.anecdote_id, a.city
    from creneaux c
    join public.user_anecdote_history h on h.user_id = c.id and h.sent_on = c.jour
    join public.anecdotes a on a.id = h.anecdote_id
   where c.cible is not null
     and mod(
           (extract(epoch from c.heure_locale::time)::int
            - extract(epoch from c.cible)::int) / 60 + 1440,
           1440
         ) < p_window_minutes
     and h.read_at is null
     and not exists (
       select 1 from public.user_anecdote_history h2
        where h2.user_id = c.id and h2.read_at >= h.sent_at
     )
     and not exists (
       select 1 from public.rappels_push r
        where r.user_id = c.id and r.jour = c.jour
     )
     and (
       select count(*)
         from public.user_anecdote_history h3
        where h3.user_id = c.id
          and h3.sent_on between c.jour - 3 and c.jour - 1
          and h3.read_at is null
     ) < 3;
$$;

revoke execute on function public.rappels_a_envoyer(int) from public, anon, authenticated;
grant execute on function public.rappels_a_envoyer(int) to service_role;
