create or replace function public.get_team_analysis(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  agent_id uuid,
  full_name text,
  avatar_url text,
  calls_count bigint,
  meetings_count bigint,
  offers_count bigint,
  signed_count bigint,
  revenue_amount numeric,
  conversion_rate numeric,
  followups_count bigint,
  activity_points bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'Kun ledere har tilgang til teamanalyse'
      using errcode = '42501';
  end if;

  return query
  with calls as (
    select cl.agent_id, count(*)::bigint as count
    from public.call_logs cl
    where cl.started_at >= p_start and cl.started_at < p_end
    group by cl.agent_id
  ), meetings as (
    select a.agent_id, count(*)::bigint as count
    from public.appointments a
    where a.starts_at >= p_start and a.starts_at < p_end
      and a.status in ('bekreftet', 'gjennomfort')
      and a.reminder_id is null
    group by a.agent_id
  ), offers as (
    select d.agent_id, count(*)::bigint as count
    from public.deals d
    where d.offer_sent_at >= p_start and d.offer_sent_at < p_end
    group by d.agent_id
  ), signed as (
    select c.agent_id, count(*)::bigint as count
    from public.contracts c
    where c.signed_at >= p_start and c.signed_at < p_end
      and c.status = 'signed'
    group by c.agent_id
  ), revenue as (
    select d.agent_id, coalesce(sum(d.amount), 0)::numeric as amount
    from public.deals d
    where d.offer_accepted_at >= p_start and d.offer_accepted_at < p_end
      and d.stage = 'akseptert'
    group by d.agent_id
  ), followups as (
    select r.agent_id, count(*)::bigint as count
    from public.reminders r
    where r.done_at >= p_start and r.done_at < p_end
      and r.done
    group by r.agent_id
  )
  select
    p.id,
    coalesce(nullif(p.full_name, ''), p.email, 'Ukjent'),
    p.avatar_url,
    coalesce(ca.count, 0),
    coalesce(me.count, 0),
    coalesce(ofr.count, 0),
    coalesce(si.count, 0),
    coalesce(re.amount, 0),
    coalesce(round(100.0 * si.count / nullif(ofr.count, 0), 1), 0),
    coalesce(fo.count, 0),
    (
      coalesce(ca.count, 0)
      + coalesce(me.count, 0) * 3
      + coalesce(ofr.count, 0) * 5
      + coalesce(si.count, 0) * 8
      + coalesce(fo.count, 0) * 2
    )::bigint
  from public.profiles p
  left join calls ca on ca.agent_id = p.id
  left join meetings me on me.agent_id = p.id
  left join offers ofr on ofr.agent_id = p.id
  left join signed si on si.agent_id = p.id
  left join revenue re on re.agent_id = p.id
  left join followups fo on fo.agent_id = p.id
  where p.role = 'agent' and p.is_active
  order by 11 desc, 8 desc;
end;
$$;

revoke execute on function public.get_team_analysis(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.get_team_analysis(timestamptz, timestamptz)
  to authenticated;

comment on function public.get_team_analysis(timestamptz, timestamptz) is
  'Lederbegrenset analyse av aktivitet og resultater per aktiv selger.';
