create table if not exists public.customer_status_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  agent_id uuid references public.profiles (id) on delete set null,
  status_id uuid references public.customer_statuses (id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists customer_status_events_customer_idx
  on public.customer_status_events (customer_id, occurred_at desc);
create index if not exists customer_status_events_agent_idx
  on public.customer_status_events (agent_id, occurred_at desc);

alter table public.customer_status_events enable row level security;
drop policy if exists customer_status_events_select on public.customer_status_events;
create policy customer_status_events_select on public.customer_status_events
  for select to authenticated
  using ((select public.is_manager()) or agent_id = (select auth.uid()));

drop policy if exists customer_status_events_insert on public.customer_status_events;
create policy customer_status_events_insert on public.customer_status_events
  for insert to authenticated
  with check ((select public.is_manager()) or agent_id = (select auth.uid()));

grant select, insert on public.customer_status_events to authenticated;

create or replace function public.record_customer_status_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status_id is not null and (tg_op = 'INSERT' or new.status_id is distinct from old.status_id) then
    insert into public.customer_status_events (customer_id, agent_id, status_id, occurred_at)
    values (new.id, (select auth.uid()), new.status_id, coalesce(new.updated_at, now()));
  end if;
  return new;
end;
$$;

drop trigger if exists customers_record_status_event on public.customers;
create trigger customers_record_status_event
  after insert or update of status_id on public.customers
  for each row execute function public.record_customer_status_event();

insert into public.customer_status_events (customer_id, agent_id, status_id, occurred_at)
select c.id, c.owner_id, c.status_id, c.updated_at
from public.customers c
where c.status_id is not null
  and not exists (
    select 1 from public.customer_status_events e where e.customer_id = c.id
  );

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
      'status:' || se.id::text,
      'status',
      se.customer_id,
      cu.name,
      se.agent_id,
      coalesce(nullif(p.full_name, ''), p.email, 'Ukjent'),
      'Statusendring',
      'Kundestatus: ' || coalesce(cs.name, 'Ingen status'),
      se.occurred_at,
      jsonb_build_object('Ny status', coalesce(cs.name, 'Ingen status'))
    from public.customer_status_events se
    join public.customers cu on cu.id = se.customer_id
    left join public.customer_statuses cs on cs.id = se.status_id
    left join public.profiles p on p.id = se.agent_id

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
