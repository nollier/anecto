-- Volet « Communauté » : un vote tous les 14 jours sur la prochaine
-- fonctionnalité, et une boîte à idées privée.
--
-- Les options sont choisies par l'équipe (scripts/communaute.mjs). Les
-- lecteurs votent pour une option, et peuvent proposer une idée que seule
-- l'équipe lit ; les meilleures deviennent des options du vote suivant.
--
-- Les résultats ne sortent qu'en POURCENTAGES : le client ne lit jamais la
-- table des votes (hors sa propre ligne), et `resultats_campagne` ne renvoie
-- aucun nombre de votes. Afficher « 4 votes » ferait vide tant que la
-- communauté est petite. Le jour où on voudra les nombres, il suffira
-- d'ajouter une colonne au retour de la fonction.

-- 1. Les campagnes de vote (une tous les 14 jours).
create table if not exists public.campagnes_vote (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique,
  titre text not null check (char_length(trim(titre)) between 5 and 120),
  debut timestamptz not null,
  fin timestamptz not null,
  cree_at timestamptz not null default now(),
  check (fin > debut)
);

comment on table public.campagnes_vote is
  'Un vote sur la prochaine fonctionnalité. Ouvert entre `debut` et `fin`.';

-- Deux campagnes ne se chevauchent pas : `campagne_en_cours` doit n'en
-- trouver qu'une.
alter table public.campagnes_vote drop constraint if exists campagnes_vote_sans_chevauchement;
alter table public.campagnes_vote
  add constraint campagnes_vote_sans_chevauchement
  exclude using gist (tstzrange(debut, fin) with &&);

-- 2. La boîte à idées. Lue par l'équipe seulement ; chacun relit les siennes
-- pour suivre leur statut.
create table if not exists public.idees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  categorie text not null check (categorie in
    ('anecdotes', 'villes', 'notifications', 'partage', 'autre')),
  texte text not null check (char_length(trim(texte)) between 10 and 500),
  statut text not null default 'envoyee' check (statut in
    ('envoyee', 'retenue', 'au_vote', 'livree', 'ecartee')),
  cree_at timestamptz not null default now()
);

create index if not exists idees_user_idx on public.idees (user_id, cree_at desc);
create index if not exists idees_statut_idx on public.idees (statut, cree_at desc);

-- 3. Les options d'une campagne.
create table if not exists public.options_vote (
  id uuid primary key default gen_random_uuid(),
  campagne_id uuid not null references public.campagnes_vote (id) on delete cascade,
  libelle text not null check (char_length(trim(libelle)) between 3 and 80),
  description text check (description is null or char_length(description) <= 160),
  ordre smallint not null default 0,
  -- L'idée d'un lecteur promue au vote : « proposé par un lecteur de Lyon ».
  idee_id uuid references public.idees (id) on delete set null,
  -- Renseigné quand l'option gagnante est livrée : alimente « Vous l'avez
  -- demandé ».
  livree_at timestamptz
);

create index if not exists options_vote_campagne_idx on public.options_vote (campagne_id, ordre);

-- 4. Les votes : un par compte et par campagne, modifiable tant que le vote
-- est ouvert.
create table if not exists public.votes (
  user_id uuid not null references auth.users (id) on delete cascade,
  campagne_id uuid not null references public.campagnes_vote (id) on delete cascade,
  option_id uuid not null references public.options_vote (id) on delete cascade,
  vote_at timestamptz not null default now(),
  primary key (user_id, campagne_id)
);

create index if not exists votes_option_idx on public.votes (option_id);

-- 5. L'annonce de chaque campagne (push + email), une fois par lecteur et
-- par canal. La ligne n'est écrite qu'après un envoi réussi.
create table if not exists public.annonces_vote (
  campagne_id uuid not null references public.campagnes_vote (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  canal text not null check (canal in ('push', 'email')),
  envoye_at timestamptz not null default now(),
  primary key (campagne_id, user_id, canal)
);

-- 6. Désinscription des emails d'annonce (lien en bas de chaque email).
alter table public.profiles
  add column if not exists annonces_email boolean not null default true;

comment on column public.profiles.annonces_email is
  'false = ne plus recevoir l''email d''ouverture des votes. Le push suit les réglages du téléphone.';

-- RLS --------------------------------------------------------------------

alter table public.campagnes_vote enable row level security;
alter table public.options_vote enable row level security;
alter table public.votes enable row level security;
alter table public.idees enable row level security;
alter table public.annonces_vote enable row level security;

drop policy if exists "Campagnes lisibles" on public.campagnes_vote;
create policy "Campagnes lisibles"
  on public.campagnes_vote for select to authenticated using (debut <= now());

drop policy if exists "Options lisibles" on public.options_vote;
create policy "Options lisibles"
  on public.options_vote for select to authenticated
  using (exists (
    select 1 from public.campagnes_vote c where c.id = campagne_id and c.debut <= now()
  ));

-- Chacun relit son vote, jamais celui des autres. L'écriture passe par
-- `voter`, qui vérifie que la campagne est ouverte.
drop policy if exists "Chacun lit son vote" on public.votes;
create policy "Chacun lit son vote"
  on public.votes for select to authenticated using (user_id = auth.uid());

-- Chacun relit ses idées. L'écriture passe par `proposer_idee` (limite d'une
-- idée par semaine).
drop policy if exists "Chacun lit ses idées" on public.idees;
create policy "Chacun lit ses idées"
  on public.idees for select to authenticated using (user_id = auth.uid());

-- `annonces_vote` : aucune policy, service_role uniquement.

-- RPC --------------------------------------------------------------------

-- La campagne à afficher : celle en cours, sinon la dernière terminée (pour
-- montrer son gagnant jusqu'au vote suivant). Une ligne par option.
create or replace function public.campagne_communaute()
returns table (
  campagne_id uuid,
  numero int,
  titre text,
  debut timestamptz,
  fin timestamptz,
  ouverte boolean,
  option_id uuid,
  libelle text,
  description text,
  ordre smallint,
  mon_choix boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select *
    from public.campagnes_vote
    where debut <= now()
    order by (fin > now()) desc, debut desc
    limit 1
  )
  select c.id, c.numero, c.titre, c.debut, c.fin, c.fin > now(),
         o.id, o.libelle, o.description, o.ordre,
         exists (
           select 1 from public.votes v
           where v.user_id = auth.uid() and v.campagne_id = c.id and v.option_id = o.id
         )
  from c
  join public.options_vote o on o.campagne_id = c.id
  order by o.ordre, o.libelle;
$$;

-- Vote ou change de vote. Refusé hors de la période de vote.
create or replace function public.voter(p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campagne uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  select c.id into v_campagne
  from public.options_vote o
  join public.campagnes_vote c on c.id = o.campagne_id
  where o.id = p_option_id and now() >= c.debut and now() < c.fin;

  if v_campagne is null then
    raise exception 'Ce vote est clos';
  end if;

  insert into public.votes (user_id, campagne_id, option_id)
  values (auth.uid(), v_campagne, p_option_id)
  on conflict (user_id, campagne_id)
  do update set option_id = excluded.option_id, vote_at = now();
end;
$$;

-- Les pourcentages d'une campagne, jamais les nombres. Visibles seulement
-- par qui a voté, ou une fois la campagne close : montrer les tendances
-- avant de voter pousserait à suivre la majorité.
--
-- Arrondi au plus fort reste : les pourcentages entiers font toujours 100.
create or replace function public.resultats_campagne(p_campagne_id uuid)
returns table (option_id uuid, pourcentage int, en_tete boolean)
language sql
stable
security definer
set search_path = public
as $$
  with acces as (
    select 1
    from public.campagnes_vote c
    where c.id = p_campagne_id
      and c.debut <= now()
      and (c.fin <= now() or exists (
        select 1 from public.votes v where v.campagne_id = c.id and v.user_id = auth.uid()
      ))
  ),
  compte as (
    select o.id, o.ordre, count(v.option_id)::numeric as n
    from public.options_vote o
    left join public.votes v on v.option_id = o.id
    where o.campagne_id = p_campagne_id and exists (select 1 from acces)
    group by o.id, o.ordre
  ),
  base as (
    select id, ordre, n,
           case when sum(n) over () = 0 then 0
                else floor(100 * n / sum(n) over ()) end as plancher,
           case when sum(n) over () = 0 then 0
                else 100 * n / sum(n) over () - floor(100 * n / sum(n) over ()) end as reste,
           sum(n) over () as total
    from compte
  ),
  rangs as (
    select *,
           row_number() over (order by reste desc, n desc, ordre) as rang,
           case when total = 0 then 0 else 100 - sum(plancher) over () end as a_repartir
    from base
  )
  select id,
         (plancher + case when rang <= a_repartir then 1 else 0 end)::int,
         total > 0 and n = max(n) over ()
  from rangs
  order by ordre;
$$;

-- Propose une idée. Une par semaine et par compte.
create or replace function public.proposer_idee(p_categorie text, p_texte text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_derniere timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  select max(cree_at) into v_derniere from public.idees where user_id = auth.uid();
  if v_derniere is not null and v_derniere > now() - interval '7 days' then
    raise exception 'Une idée par semaine : prochaine possible le %',
      to_char(v_derniere + interval '7 days', 'DD/MM');
  end if;

  insert into public.idees (user_id, categorie, texte)
  values (auth.uid(), p_categorie, trim(p_texte));

  -- La date à laquelle une nouvelle idée sera possible.
  return now() + interval '7 days';
end;
$$;

-- « Vous l'avez demandé » : les options gagnantes livrées.
create or replace function public.fonctionnalites_livrees()
returns table (libelle text, livree_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select libelle, livree_at
  from public.options_vote
  where livree_at is not null
  order by livree_at desc
  limit 5;
$$;

revoke execute on function public.campagne_communaute() from public, anon;
revoke execute on function public.voter(uuid) from public, anon;
revoke execute on function public.resultats_campagne(uuid) from public, anon;
revoke execute on function public.proposer_idee(text, text) from public, anon;
revoke execute on function public.fonctionnalites_livrees() from public, anon;
grant execute on function public.campagne_communaute() to authenticated;
grant execute on function public.voter(uuid) to authenticated;
grant execute on function public.resultats_campagne(uuid) to authenticated;
grant execute on function public.proposer_idee(text, text) to authenticated;
grant execute on function public.fonctionnalites_livrees() to authenticated;

-- Annonces (push + email) --------------------------------------------------

-- Les lecteurs à prévenir de la campagne ouverte, par canal. Un compte créé
-- après l'ouverture n'est pas concerné : il découvrira le vote dans l'app.
create or replace function public.annonces_vote_a_envoyer(p_canal text, p_limit int)
returns table (campagne_id uuid, user_id uuid, destination text)
language sql
stable
security definer
set search_path = public, auth
as $$
  with c as (
    select id, debut from public.campagnes_vote
    where now() >= debut and now() < fin
    limit 1
  )
  select c.id, p.id,
         case when p_canal = 'push' then p.expo_push_token else u.email end
  from c
  join public.profiles p on p.created_at < c.debut
  join auth.users u on u.id = p.id
  where (
      (p_canal = 'push' and p.expo_push_token is not null)
      or (p_canal = 'email' and u.email is not null and p.annonces_email)
    )
    and not exists (
      select 1 from public.annonces_vote a
      where a.campagne_id = c.id and a.user_id = p.id and a.canal = p_canal
    )
  order by p.created_at
  limit p_limit;
$$;

revoke execute on function public.annonces_vote_a_envoyer(text, int) from public, anon, authenticated;
grant execute on function public.annonces_vote_a_envoyer(text, int) to service_role;

-- Appelée par pg_cron : ne réveille l'Edge Function que s'il reste des
-- annonces à envoyer.
create or replace function public.declencher_annonces_vote()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.annonces_vote_a_envoyer('push', 1))
     and not exists (select 1 from public.annonces_vote_a_envoyer('email', 1)) then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'anecto_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'anecto_admin_secret';
  if v_url is null or v_secret is null then
    raise exception 'Secrets anecto_functions_url / anecto_admin_secret absents de Vault';
  end if;

  return net.http_post(
    url := v_url || '/annonce-vote',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-anecto-admin-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.declencher_annonces_vote() from public, anon, authenticated;

-- Toutes les 10 minutes de 7 h à 18 h UTC (8 h à 19 h à Paris en hiver) : une annonce ne
-- part jamais la nuit, et un lot de 100 emails par passage suffit largement.
select cron.unschedule('anecto-annonces-vote')
where exists (select 1 from cron.job where jobname = 'anecto-annonces-vote');
select cron.schedule('anecto-annonces-vote', '*/10 7-18 * * *', $$select public.declencher_annonces_vote()$$);

-- Premier vote : du 1er au 14 décembre 2026 inclus ------------------------

insert into public.campagnes_vote (numero, titre, debut, fin)
values (
  1,
  'Que voulez-vous en priorité ?',
  '2026-12-01 09:00:00 Europe/Paris',
  '2026-12-15 00:00:00 Europe/Paris'
)
on conflict (numero) do nothing;

insert into public.options_vote (campagne_id, libelle, description, ordre)
select c.id, o.libelle, o.description, o.ordre
from public.campagnes_vote c
cross join (values
  ('Suivre 2 villes', 'Une anecdote de ta ville et une d''une autre ville de ton choix', 1),
  ('Des images dans les anecdotes', 'Une photo du lieu quand une image libre de droits existe', 2),
  ('Sauvegarder mes favorites', 'Garder les anecdotes que tu préfères pour les relire', 3)
) as o (libelle, description, ordre)
where c.numero = 1
  and not exists (select 1 from public.options_vote x where x.campagne_id = c.id);
