-- Alerte email sur les idées de la boîte à idées (onglet Communauté).
--
-- `idees` n'était lue par personne : aucune alerte ne partait. On réutilise
-- le circuit des retours : même fonction (`notify-feedback`), même trigger
-- immédiat, même cron de rattrapage toutes les quinze minutes.

alter table public.idees
  add column if not exists notified_at timestamptz;

create index if not exists idees_a_signaler_idx
  on public.idees (cree_at)
  where notified_at is null;

create or replace function public.idees_a_signaler(p_limit int default 25)
returns table (
  id uuid,
  categorie text,
  texte text,
  cree_at timestamptz,
  auteur text
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.categorie, i.texte, i.cree_at, u.email::text
    from public.idees i
    left join auth.users u on u.id = i.user_id
   where i.notified_at is null
   order by i.cree_at
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.idees_a_signaler(int) from public, anon, authenticated;
grant execute on function public.idees_a_signaler(int) to service_role;

-- Même règle que pour `feedback` : l'alerte ne doit jamais empêcher le dépôt.
create or replace function public.idees_apres_insertion()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  begin
    perform public.declencher_alerte_retours();
  exception when others then
    raise warning 'Alerte idée non déclenchée : %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.idees_apres_insertion() from public, anon, authenticated;

drop trigger if exists idees_alerte on public.idees;
create trigger idees_alerte
  after insert on public.idees
  for each row execute function public.idees_apres_insertion();
