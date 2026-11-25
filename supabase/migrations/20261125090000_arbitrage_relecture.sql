-- La relecture des anecdotes `a_relire` confiée à un arbitre (mode `arbitrer`
-- de `generate-anecdote`, voir `arbitrage.ts`) : il juge les reproches du
-- vérificateur, fait corriger si besoin, puis publie ou rejette. Le rapport
-- du matin dit ce qu'il a décidé. Ce qu'il n'a pas pu trancher (panne,
-- sources illisibles) reste dans « À relire », avec les liens de relecture.

alter table public.anecdotes
  add column if not exists arbitree_le timestamptz;

create table if not exists public.arbitrages_relecture (
  id uuid primary key default gen_random_uuid(),
  anecdote_id uuid not null references public.anecdotes(id) on delete cascade,
  ville text not null,
  titre_avant text not null,
  titre_apres text,
  decision text not null check (decision in ('publiee', 'publiee_corrigee', 'rejetee', 'gardee')),
  motif text not null,
  consignes text[] not null default '{}',
  reproches jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.arbitrages_relecture enable row level security;

create index if not exists arbitrages_relecture_created_at_idx
  on public.arbitrages_relecture (created_at);

create or replace function public.arbitrer_relectures(p_limit int default 1)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Rien à arbitrer : pas d'appel, pas de coût.
  if not exists (
    select 1 from public.anecdotes
     where status = 'draft' and a_relire and arbitree_le is null
  ) then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'anecto_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'anecto_admin_secret';

  if v_url is null or v_secret is null then
    raise exception 'Secrets anecto_functions_url / anecto_admin_secret absents de Vault';
  end if;

  return net.http_post(
    url := v_url || '/generate-anecdote',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-anecto-admin-secret', v_secret
    ),
    body := jsonb_build_object('mode', 'arbitrer', 'limit', p_limit),
    timeout_milliseconds := 300000
  );
end;
$$;

revoke execute on function public.arbitrer_relectures(int) from public, anon, authenticated;

-- Une anecdote par passage, toutes les dix minutes : un arbitrage avec
-- correction coûte quatre ou cinq appels DeepSeek.
select cron.unschedule('anecto-arbitrage-relecture')
 where exists (select 1 from cron.job where jobname = 'anecto-arbitrage-relecture');

select cron.schedule(
  'anecto-arbitrage-relecture',
  '8,18,28,38,48,58 * * * *',
  $$select public.arbitrer_relectures(1)$$
);

-- Le suivi du matin : les décisions de l'arbitre des dernières 24 heures.
create or replace function public.suivi_quotidien()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'deepseek', (
      select jsonb_build_object(
               'appels', count(*)::int,
               'jetons_entree', coalesce(sum(d.jetons_entree), 0)::bigint,
               'jetons_cache', coalesce(sum(d.jetons_cache), 0)::bigint,
               'jetons_sortie', coalesce(sum(d.jetons_sortie), 0)::bigint,
               'par_etape', coalesce((
                 select jsonb_agg(jsonb_build_object('etape', e.etape, 'appels', e.n, 'jetons', e.jetons)
                                  order by e.jetons desc)
                   from (
                     select etape, count(*)::int as n,
                            sum(jetons_entree + jetons_sortie)::bigint as jetons
                       from public.deepseek_appels
                      where created_at >= now() - interval '24 hours'
                      group by etape
                   ) e
               ), '[]'::jsonb)
             )
        from public.deepseek_appels d
       where d.created_at >= now() - interval '24 hours'
    ),
    'a_relire', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'ville', a.city, 'titre', a.title)
                       order by a.created_at)
        from public.anecdotes a
       where a.status = 'draft' and a.a_relire
    ), '[]'::jsonb),
    'arbitrages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ville', r.ville,
               'titre_avant', r.titre_avant,
               'titre_apres', r.titre_apres,
               'decision', r.decision,
               'motif', r.motif,
               'consignes', to_jsonb(r.consignes)
             ) order by r.created_at)
        from public.arbitrages_relecture r
       where r.created_at >= now() - interval '24 hours'
         and r.decision <> 'gardee'
    ), '[]'::jsonb),
    'nouveaux_comptes', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'ville', p.city) order by u.created_at)
        from auth.users u
        left join public.profiles p on p.id = u.id
       where u.created_at >= now() - interval '24 hours'
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.suivi_quotidien() from public, anon, authenticated;
grant execute on function public.suivi_quotidien() to service_role;
