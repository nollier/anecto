-- File de relecture et sélection quotidienne.
--
-- Avant : l'app choisissait l'anecdote elle-même, en trois requêtes, et
-- tentait d'incrémenter `reuse_count` — écriture que RLS refuse, silencieusement.
-- Le compteur ne bougeait donc jamais et la même anecdote revenait chaque jour.
-- La sélection passe ici, où l'incrément est possible et atomique.

-- 1. Jour d'envoi, dans le fuseau de l'utilisateur.
--    Sans cette colonne, « une anecdote par jour » n'est pas exprimable en
--    contrainte : date(sent_at) n'est pas immutable pour un timestamptz.
alter table public.user_anecdote_history
  add column if not exists sent_on date;

update public.user_anecdote_history
   set sent_on = (sent_at at time zone 'UTC')::date
 where sent_on is null;

-- Défensif : dédoublonne avant de poser la contrainte.
delete from public.user_anecdote_history h
 where exists (
   select 1 from public.user_anecdote_history plus_ancien
    where plus_ancien.user_id = h.user_id
      and plus_ancien.sent_on = h.sent_on
      and plus_ancien.sent_at < h.sent_at
 );

alter table public.user_anecdote_history
  alter column sent_on set default ((now() at time zone 'UTC')::date);

create unique index if not exists user_anecdote_history_user_day_key
  on public.user_anecdote_history (user_id, sent_on);

-- 2. File de relecture. Vue d'administration : lue depuis le Table Editor
--    ou avec la clé de service, jamais par l'app.
create or replace view public.anecdotes_a_valider
with (security_invoker = on) as
select a.id,
       a.city,
       a.title,
       a.period,
       a.body,
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

-- 3. validated_at se remplit tout seul : valider depuis le Table Editor
--    revient alors à changer `status`, sans rien oublier.
create or replace function public.set_validated_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'validated' and (tg_op = 'INSERT' or old.status is distinct from 'validated') then
    new.validated_at := now();
  elsif new.status <> 'validated' then
    new.validated_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists anecdotes_set_validated_at on public.anecdotes;
create trigger anecdotes_set_validated_at
  before insert or update on public.anecdotes
  for each row execute function public.set_validated_at();

-- 4. Sélection quotidienne : rotation, exclusion de l'historique, incrément du
--    compteur et écriture de l'historique dans une seule transaction.
--    security definer parce que RLS interdit — à raison — toute écriture du
--    client sur `anecdotes`.
create or replace function public.get_daily_anecdote()
returns public.anecdotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_today date;
  v_anecdote public.anecdotes;
begin
  if v_user is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_user;
  if not found or coalesce(v_profile.city_place_id, v_profile.city) is null then
    return null;
  end if;

  v_today := (now() at time zone coalesce(v_profile.timezone, 'UTC'))::date;

  -- Déjà servie aujourd'hui : on renvoie la même. Le rituel est quotidien,
  -- rouvrir l'app ne doit pas consommer une anecdote de plus.
  select a.* into v_anecdote
    from public.user_anecdote_history h
    join public.anecdotes a on a.id = h.anecdote_id
   where h.user_id = v_user and h.sent_on = v_today
   limit 1;

  if found then
    return v_anecdote;
  end if;

  -- La moins servie, jamais lue par cet utilisateur. random() départage les
  -- ex aequo, sinon tout le monde reçoit la même le premier jour.
  select a.* into v_anecdote
    from public.anecdotes a
   where a.status = 'validated'
     and case
           when v_profile.city_place_id is not null
             then a.city_place_id = v_profile.city_place_id
           else a.city = v_profile.city
         end
     and not exists (
       select 1
         from public.user_anecdote_history h
        where h.user_id = v_user and h.anecdote_id = a.id
     )
   order by a.reuse_count, random()
   limit 1;

  if not found then
    return null;
  end if;

  insert into public.user_anecdote_history (user_id, anecdote_id, sent_on)
  values (v_user, v_anecdote.id, v_today)
  on conflict (user_id, sent_on) do nothing;

  if not found then
    -- Course entre deux appareils : l'autre a écrit en premier, on renvoie
    -- son choix plutôt que d'en servir deux le même jour.
    select a.* into v_anecdote
      from public.user_anecdote_history h
      join public.anecdotes a on a.id = h.anecdote_id
     where h.user_id = v_user and h.sent_on = v_today
     limit 1;
    return v_anecdote;
  end if;

  update public.anecdotes
     set reuse_count = reuse_count + 1
   where id = v_anecdote.id;

  v_anecdote.reuse_count := v_anecdote.reuse_count + 1;
  return v_anecdote;
end;
$$;

-- anon conserverait sinon un droit d'exécution hérité des défauts Supabase.
revoke execute on function public.get_daily_anecdote() from public, anon;
grant execute on function public.get_daily_anecdote() to authenticated;
