-- Rapatriée depuis la prod (appliquée le 22/10/2026 hors dépôt).
create or replace function public.relances_a_envoyer(p_limit int default 100)
returns table (user_id uuid, email text, ville text, en_attente int)
language sql
stable
security definer
set search_path = public
as $$
  with serie as (
    select h.user_id, count(*)::int as non_lues
      from public.user_anecdote_history h
     where h.read_at is null
       and h.sent_at > coalesce(
             (select max(h2.sent_at) from public.user_anecdote_history h2
               where h2.user_id = h.user_id and h2.read_at is not null),
             '-infinity'::timestamptz
           )
     group by h.user_id
  )
  select p.id, u.email::text, p.city, s.non_lues
    from serie s
    join public.profiles p on p.id = s.user_id
    join auth.users u on u.id = p.id
   where s.non_lues between 5 and 9
     and u.email is not null
     and p.city is not null
     and (
       p.relance_retard_at is null
       or exists (
         select 1 from public.user_anecdote_history h
          where h.user_id = p.id and h.read_at > p.relance_retard_at
       )
     )
   order by s.non_lues desc
   limit greatest(p_limit, 1);
$$;

select cron.unschedule('anecto-relances-retard')
 where exists (select 1 from cron.job where jobname = 'anecto-relances-retard');
select cron.schedule('anecto-relances-retard', '23 8 * * *', $$select public.declencher_relances_retard()$$);
