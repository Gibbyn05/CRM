-- Ledertavle og dashboard skal telle salg på tidspunktet salget faktisk ble
-- akseptert, ikke på siste endring av deal-raden. updated_at flytter seg ved
-- senere redigeringer og kan ellers gi feil salgsperiode.

update public.deals
set offer_accepted_at = coalesce(offer_accepted_at, updated_at)
where stage = 'akseptert'
  and offer_accepted_at is null;

create or replace function public.get_leaderboard(
  p_start timestamptz,
  p_end   timestamptz
)
returns table (
  agent_id            uuid,
  full_name           text,
  calls_count         bigint,
  meetings_confirmed  bigint,
  sales_count         bigint,
  rejections_count    bigint,
  sales_amount        numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as agent_id,
    p.full_name,
    coalesce(c.calls_count, 0)        as calls_count,
    coalesce(a.meetings_confirmed, 0) as meetings_confirmed,
    coalesce(d.sales_count, 0)        as sales_count,
    coalesce(l.rejections_count, 0)   as rejections_count,
    coalesce(d.sales_amount, 0)       as sales_amount
  from public.profiles p
  left join (
    select agent_id, count(*) as calls_count
    from public.call_logs
    where started_at >= p_start and started_at < p_end
    group by agent_id
  ) c on c.agent_id = p.id
  left join (
    select agent_id, count(*) filter (where status = 'bekreftet') as meetings_confirmed
    from public.appointments
    where starts_at >= p_start and starts_at < p_end
    group by agent_id
  ) a on a.agent_id = p.id
  left join (
    select
      agent_id,
      count(*) as sales_count,
      coalesce(sum(amount), 0) as sales_amount
    from public.deals
    where stage = 'akseptert'
      and offer_accepted_at >= p_start
      and offer_accepted_at < p_end
    group by agent_id
  ) d on d.agent_id = p.id
  left join (
    select agent_id, count(*) as rejections_count
    from public.deals
    where stage = 'tapt'
      and updated_at >= p_start
      and updated_at < p_end
    group by agent_id
  ) l on l.agent_id = p.id
  where p.role = 'agent' and p.is_active
  order by sales_count desc, meetings_confirmed desc, calls_count desc;
$$;

grant execute on function public.get_leaderboard(timestamptz, timestamptz) to authenticated;

create or replace function public.get_agent_stats(
  p_agent_id uuid,
  p_start    timestamptz,
  p_end      timestamptz
)
returns table (
  calls_count        bigint,
  meetings_confirmed bigint,
  sales_count        bigint,
  rejections_count   bigint,
  sales_amount       numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agent uuid := p_agent_id;
begin
  if not public.is_manager() then
    v_agent := auth.uid();
  end if;

  return query
  select
    (select count(*) from public.call_logs cl
       where cl.started_at >= p_start and cl.started_at < p_end
         and (v_agent is null or cl.agent_id = v_agent))::bigint,
    (select count(*) from public.appointments a
       where a.starts_at >= p_start and a.starts_at < p_end
         and a.status = 'bekreftet'
         and (v_agent is null or a.agent_id = v_agent))::bigint,
    (select count(*) from public.deals d
       where d.offer_accepted_at >= p_start and d.offer_accepted_at < p_end
         and d.stage = 'akseptert'
         and (v_agent is null or d.agent_id = v_agent))::bigint,
    (select count(*) from public.deals d
       where d.updated_at >= p_start and d.updated_at < p_end
         and d.stage = 'tapt'
         and (v_agent is null or d.agent_id = v_agent))::bigint,
    coalesce((select sum(d.amount) from public.deals d
       where d.offer_accepted_at >= p_start and d.offer_accepted_at < p_end
         and d.stage = 'akseptert'
         and (v_agent is null or d.agent_id = v_agent)), 0)::numeric;
end;
$$;

grant execute on function public.get_agent_stats(uuid, timestamptz, timestamptz) to authenticated;
