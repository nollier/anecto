-- Schéma d'origine.
--
-- Ce fichier manquait au dépôt : la migration avait été appliquée directement
-- sur le projet, jamais versionnée. Le contenu ci-dessous est celui que la
-- base a réellement exécuté, relu depuis `supabase_migrations.schema_migrations`
-- et restitué à l'identique. Sans lui, un clone du dépôt ne peut pas
-- reconstruire la base, et `supabase db push` bute sur une version distante
-- qu'il ne trouve nulle part en local.
--
-- Rien ici ne décrit l'état actuel du schéma : tout ce qui suit a été corrigé,
-- durci ou remplacé par les migrations suivantes. C'est un point de départ,
-- pas une référence — la politique « Anyone can read validated anecdotes »,
-- par exemple, a été fermée depuis par `20260819060000`.

-- Profils utilisateurs (liés à auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  city text not null,
  notification_hour time not null default '21:00',
  expo_push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Anecdotes
create table public.anecdotes (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  title text not null,
  body text not null check (char_length(body) between 50 and 3000),
  source text not null,
  status text not null default 'draft' check (status in ('draft','validated','rejected')),
  reuse_count integer not null default 0,
  created_at timestamptz not null default now(),
  validated_at timestamptz
);

create index anecdotes_city_status_idx on public.anecdotes (city, status);

-- Historique d'envoi par utilisateur
create table public.user_anecdote_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  anecdote_id uuid not null references public.anecdotes(id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique (user_id, anecdote_id)
);

-- Feedback utilisateur
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  anecdote_id uuid not null references public.anecdotes(id) on delete cascade,
  type text not null check (type in ('adore','incomplete','propose')),
  comment text,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.anecdotes enable row level security;
alter table public.user_anecdote_history enable row level security;
alter table public.feedback enable row level security;

create policy "Users manage own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "Anyone can read validated anecdotes" on public.anecdotes
  for select using (status = 'validated');

create policy "Users read own history" on public.user_anecdote_history
  for select using (auth.uid() = user_id);

create policy "Users insert own history" on public.user_anecdote_history
  for insert with check (auth.uid() = user_id);

create policy "Users manage own feedback" on public.feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
