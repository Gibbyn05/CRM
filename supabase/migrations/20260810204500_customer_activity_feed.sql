create or replace function public.get_recent_customer_activities(p_limit integer default 12)
returns table (
  activity_id text,
  activity_type text,
  customer_id uuid,
  customer_name text,
  agent_id uuid,
  agent_name text,
  title text,
  summary text,
  occurred_at timestamptz,
  details jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with activity as (
    select
      'call:' || cl.id::text as activity_id,
      'call'::text as activity_type,
      cl.customer_id,
      cu.name as customer_name,
      cl.agent_id,
      coalesce(nullif(p.full_name, ''), p.email, 'Ukjent') as agent_name,
      'Samtale'::text as title,
      case cl.status::text
        when 'answered' then 'Besvart samtale'
        when 'ended' then 'Avsluttet samtale'
        when 'missed' then 'Ubesvart samtale'
        when 'failed' then 'Mislykket samtale'
        else 'Utgående samtale'
      end as summary,
      coalesce(cl.ended_at, cl.started_at, cl.created_at) as occurred_at,
      jsonb_build_object(
        'Telefonnummer', coalesce(cl.phone_number, 'Ikke registrert'),
        'Varighet', case when cl.duration_seconds is null then 'Ikke registrert' else cl.duration_seconds::text || ' sekunder' end,
        'Retning', case cl.direction::text when 'inbound' then 'Innkommende' else 'Utgående' end
      ) as details
    from public.call_logs cl
    join public.customers cu on cu.id = cl.customer_id
    left join public.profiles p on p.id = cl.agent_id

    union all

    select
      'email:' || c.id::text,
      'email',
      c.customer_id,
      cu.name,
      c.agent_id,
      coalesce(nullif(p.full_name, ''), p.email, 'Ukjent'),
      'E-post',
      'E-post sendt',
      c.sent_at,
      jsonb_build_object('Mottaker', c.recipient, 'Hendelse', 'sendt')
    from public.contracts c
    join public.customers cu on cu.id = c.customer_id
    left join public.profiles p on p.id = c.agent_id
    where c.channel::text = 'email' and c.sent_at is not null

    union all

    select
      'meeting:' || a.id::text,
      'meeting',
      a.customer_id,
      cu.name,
      a.agent_id,
      coalesce(nullif(p.full_name, ''), p.email, 'Ukjent'),
      'Møte',
      a.title,
      a.updated_at,
      jsonb_build_object(
        'Møtetid', to_char(a.starts_at at time zone 'Europe/Oslo', 'DD.MM.YYYY HH24:MI'),
        'Status', replace(a.status::text, '_', ' '),
        'Sted', coalesce(a.location, 'Ikke angitt')
      )
    from public.appointments a
    join public.customers cu on cu.id = a.customer_id
    left join public.profiles p on p.id = a.agent_id

    union all

    select
      'note:' || n.id::text,
      'note',
      n.customer_id,
      cu.name,
      n.author_id,
      coalesce(nullif(p.full_name, ''), p.email, 'Ukjent'),
      'Notat',
      left(n.body, 140),
      n.created_at,
      jsonb_build_object('Notat', n.body, 'Type', replace(n.note_type::text, '_', ' '))
    from public.notes n
    join public.customers cu on cu.id = n.customer_id
    left join public.profiles p on p.id = n.author_id

    union all

    select
      'task:' || r.id::text,
      'task',
      r.customer_id,
      cu.name,
      r.agent_id,
      coalesce(nullif(p.full_name, ''), p.email, 'Ukjent'),
      'Oppgave',
      case when r.done then 'Fullført: ' || r.title else r.title end,
      coalesce(r.done_at, r.updated_at, r.created_at),
      jsonb_build_object(
        'Frist', to_char(r.due_at at time zone 'Europe/Oslo', 'DD.MM.YYYY HH24:MI'),
        'Status', case when r.done then 'Fullført' else 'Åpen' end,
        'Notat', coalesce(r.note, 'Ingen beskrivelse')
      )
    from public.reminders r
    join public.customers cu on cu.id = r.customer_id
    left join public.profiles p on p.id = r.agent_id

    union all

    select
      'status:' || cu.id::text,
      'status',
      cu.id,
      cu.name,
      cu.owner_id,
      coalesce(nullif(p.full_name, ''), p.email, 'Ukjent'),
      'Statusendring',
      'Kundestatus: ' || coalesce(cs.name, 'Ingen status'),
      cu.updated_at,
      jsonb_build_object('Ny status', coalesce(cs.name, 'Ingen status'))
    from public.customers cu
    left join public.customer_statuses cs on cs.id = cu.status_id
    left join public.profiles p on p.id = cu.owner_id
    where cu.status_id is not null

    union all

    select
      'offer:' || d.id::text,
      'offer',
      d.customer_id,
      cu.name,
      d.agent_id,
      coalesce(nullif(p.full_name, ''), p.email, 'Ukjent'),
      'Tilbud',
      d.title,
      d.offer_sent_at,
      jsonb_build_object('Beløp', coalesce(d.amount::text || ' ' || d.currency, 'Ikke angitt'), 'Status', replace(d.stage::text, '_', ' '))
    from public.deals d
    join public.customers cu on cu.id = d.customer_id
    left join public.profiles p on p.id = d.agent_id
    where d.offer_sent_at is not null

    union all

    select
      'signature:' || c.id::text,
      'signature',
      c.customer_id,
      cu.name,
      c.agent_id,
      coalesce(nullif(p.full_name, ''), p.email, 'Ukjent'),
      'Signering',
      'Avtale signert' || case when c.signer_name is not null then ' av ' || c.signer_name else '' end,
      c.signed_at,
      jsonb_build_object('Signert av', coalesce(c.signer_name, 'Ikke registrert'), 'Mottaker', c.recipient)
    from public.contracts c
    join public.customers cu on cu.id = c.customer_id
    left join public.profiles p on p.id = c.agent_id
    where c.signed_at is not null

    union all

    select
      'payment:' || cm.id::text,
      'payment',
      cm.customer_id,
      cu.name,
      cm.agent_id,
      coalesce(nullif(p.full_name, ''), p.email, 'Ukjent'),
      'Betaling',
      case when cm.status = 'betalt' then 'Betaling registrert' else 'Faktura oppdatert' end,
      coalesce(cm.paid_at, cm.invoiced_at, cm.updated_at),
      jsonb_build_object('Beløp', cm.sale_amount::text || ' NOK', 'Status', replace(cm.status, '_', ' '))
    from public.commissions cm
    join public.customers cu on cu.id = cm.customer_id
    left join public.profiles p on p.id = cm.agent_id
    where cm.status in ('fakturert', 'forfalt', 'betalt')
  )
  select
    a.activity_id,
    a.activity_type,
    a.customer_id,
    a.customer_name,
    a.agent_id,
    a.agent_name,
    a.title,
    a.summary,
    a.occurred_at,
    a.details
  from activity a
  where a.occurred_at is not null
    and ((select public.is_manager()) or a.agent_id = (select auth.uid()))
  order by a.occurred_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;

revoke execute on function public.get_recent_customer_activities(integer) from public, anon;
grant execute on function public.get_recent_customer_activities(integer) to authenticated;

