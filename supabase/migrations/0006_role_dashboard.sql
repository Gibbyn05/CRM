-- ============================================================================
--  0006_role_dashboard.sql
--  Rollebasert dashboard + strammere sletting av kunder.
--   - Kun ledere (manager) kan slette kunder. Selgere kan ikke lenger slette.
--   - get_agent_stats(): personlige nøkkeltall for et tidsrom (til dashbordet).
--   - get_call_buckets(): samtaler per tidsbøtte (til grafen).
--  Begge funksjonene tvinger selgere til kun å se egne tall, uansett input.
--  Ledere kan be om en bestemt agent (p_agent_id) eller hele teamet (null).
-- ============================================================================

-- 1) Kun ledere kan slette kunder.
drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers
  for delete to authenticated
  using (public.is_manager());

-- 2) Personlige nøkkeltall for ett tidsrom.
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
  -- Selgere ser kun egne tall, uansett hva som sendes inn.
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
       where d.updated_at >= p_start and d.updated_at < p_end
         and d.stage = 'akseptert'
         and (v_agent is null or d.agent_id = v_agent))::bigint,
    (select count(*) from public.deals d
       where d.updated_at >= p_start and d.updated_at < p_end
         and d.stage = 'tapt'
         and (v_agent is null or d.agent_id = v_agent))::bigint,
    coalesce((select sum(d.amount) from public.deals d
       where d.updated_at >= p_start and d.updated_at < p_end
         and d.stage = 'akseptert'
         and (v_agent is null or d.agent_id = v_agent)), 0)::numeric;
end;
$$;

-- 3) Samtaler per tidsbøtte til grafen. p_trunc: 'hour' | 'day' | 'week' | 'month'.
--    Nullfyller tomme bøtter slik at grafen får en jevn akse.
create or replace function public.get_call_buckets(
  p_agent_id uuid,
  p_start    timestamptz,
  p_end      timestamptz,
  p_trunc    text
)
returns table (
  bucket timestamptz,
  calls  bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agent uuid := p_agent_id;
  v_step  interval := case p_trunc
    when 'hour'  then interval '1 hour'
    when 'day'   then interval '1 day'
    when 'week'  then interval '1 week'
    when 'month' then interval '1 month'
    else interval '1 day' end;
begin
  if not public.is_manager() then
    v_agent := auth.uid();
  end if;

  return query
  with b as (
    select generate_series(
      date_trunc(p_trunc, p_start),
      date_trunc(p_trunc, greatest(p_start, p_end - interval '1 microsecond')),
      v_step
    ) as bucket
  )
  select b.bucket,
         count(cl.id)::bigint as calls
  from b
  left join public.call_logs cl
    on cl.started_at is not null
   and date_trunc(p_trunc, cl.started_at) = b.bucket
   and cl.started_at >= p_start and cl.started_at < p_end
   and (v_agent is null or cl.agent_id = v_agent)
  group by b.bucket
  order by b.bucket;
end;
$$;

grant execute on function public.get_agent_stats(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_call_buckets(uuid, timestamptz, timestamptz, text) to authenticated;

comment on function public.get_agent_stats is 'Personlige nøkkeltall for et tidsrom; selgere ser kun egne tall.';
comment on function public.get_call_buckets is 'Samtaler per tidsbøtte (hour/day/week/month) til dashbord-grafen.';
