-- ============================================================================
--  0002_functions_triggers.sql
--  Funksjoner og triggere:
--   - updated_at auto-oppdatering
--   - opprett profile + agent_states når ny auth-bruker lages
--   - rolle-hjelpefunksjoner for RLS
--   - process_call_event(): sentral logikk for telefoni-hendelser
--   - get_leaderboard(): aggregert ledertavle for et tidsrom
-- ============================================================================

-- ---------------------------------------------------------------------------
--  updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger call_logs_set_updated_at
  before update on public.call_logs
  for each row execute function public.set_updated_at();

create trigger deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create trigger contracts_set_updated_at
  before update on public.contracts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
--  Ny bruker -> profile + agent_states
--  Kjøres som SECURITY DEFINER på auth.users-trigger.
--  full_name / role kan sendes via raw_user_meta_data ved sign-up.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'agent')
  )
  on conflict (id) do nothing;

  insert into public.agent_states (agent_id, status)
  values (new.id, 'offline')
  on conflict (agent_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
--  Rolle-hjelpefunksjoner (brukes i RLS-policies)
-- ---------------------------------------------------------------------------
create or replace function public.current_role_is(target user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = target
  );
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role_is('manager');
$$;

-- ---------------------------------------------------------------------------
--  process_call_event()
--  Sentral, idempotent håndtering av telefoni-hendelser fra Bria/Ice.
--  Kalles av webhook-route (server, service-role). Oppdaterer call_logs OG
--  agent_states atomisk slik at Realtime kan kringkaste status-endringer.
--
--  p_event_type: 'call_started' | 'call_answered' | 'call_ended' | 'call_missed'
--  p_agent_id kan utledes fra extension hvis ikke oppgitt direkte.
-- ---------------------------------------------------------------------------
create or replace function public.process_call_event(
  p_event_type      text,
  p_external_call_id text,
  p_agent_id        uuid default null,
  p_extension       text default null,
  p_customer_id     uuid default null,
  p_phone_number    text default null,
  p_direction       call_direction default 'outbound',
  p_occurred_at     timestamptz default now(),
  p_raw_payload     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_id uuid := p_agent_id;
  v_call_id  uuid;
begin
  -- Utled agent fra extension hvis id ikke er oppgitt.
  if v_agent_id is null and p_extension is not null then
    select id into v_agent_id from public.profiles where extension = p_extension;
  end if;

  -- Finn eller opprett call_log (idempotent på external_call_id).
  select id into v_call_id
  from public.call_logs
  where external_call_id = p_external_call_id;

  if v_call_id is null then
    insert into public.call_logs (
      external_call_id, agent_id, customer_id, direction, status,
      phone_number, raw_payload
    )
    values (
      p_external_call_id, v_agent_id, p_customer_id, p_direction, 'ringing',
      p_phone_number, p_raw_payload
    )
    returning id into v_call_id;
  else
    update public.call_logs
    set agent_id     = coalesce(v_agent_id, agent_id),
        customer_id  = coalesce(p_customer_id, customer_id),
        phone_number = coalesce(p_phone_number, phone_number),
        raw_payload  = coalesce(public.call_logs.raw_payload, '{}'::jsonb) || coalesce(p_raw_payload, '{}'::jsonb)
    where id = v_call_id;
  end if;

  -- Oppdater call_log-status og agent_states basert på hendelsestype.
  if p_event_type = 'call_started' then
    update public.call_logs
    set status = 'ringing', started_at = coalesce(started_at, p_occurred_at)
    where id = v_call_id;

    if v_agent_id is not null then
      update public.agent_states
      set status = 'in_call',
          current_call_id = v_call_id,
          last_call_started_at = p_occurred_at,
          status_changed_at = now(),
          updated_at = now()
      where agent_id = v_agent_id;
    end if;

  elsif p_event_type = 'call_answered' then
    update public.call_logs
    set status = 'answered', answered_at = coalesce(answered_at, p_occurred_at)
    where id = v_call_id;

    if v_agent_id is not null then
      update public.agent_states
      set status = 'in_call',
          current_call_id = v_call_id,
          status_changed_at = case when status <> 'in_call' then now() else status_changed_at end,
          updated_at = now()
      where agent_id = v_agent_id;
    end if;

  elsif p_event_type in ('call_ended', 'call_missed') then
    update public.call_logs
    set status = case when p_event_type = 'call_missed' then 'missed' else 'ended' end,
        ended_at = coalesce(ended_at, p_occurred_at),
        duration_seconds = coalesce(
          duration_seconds,
          case
            when answered_at is not null then greatest(0, extract(epoch from (p_occurred_at - answered_at))::int)
            when started_at is not null then greatest(0, extract(epoch from (p_occurred_at - started_at))::int)
            else null
          end
        )
    where id = v_call_id;

    if v_agent_id is not null then
      update public.agent_states
      set status = 'available',
          current_call_id = null,
          last_call_ended_at = p_occurred_at,
          status_changed_at = now(),
          updated_at = now()
      where agent_id = v_agent_id;
    end if;
  end if;

  return v_call_id;
end;
$$;

comment on function public.process_call_event is 'Idempotent håndtering av telefoni-hendelser; oppdaterer call_logs + agent_states.';

-- ---------------------------------------------------------------------------
--  set_agent_status()
--  Lar en agent manuelt sette pause/ledig (f.eks. via UI-knapp).
-- ---------------------------------------------------------------------------
create or replace function public.set_agent_status(p_status agent_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agent_states
  set status = p_status,
      status_changed_at = now(),
      updated_at = now(),
      current_call_id = case when p_status = 'in_call' then current_call_id else null end
  where agent_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
--  get_leaderboard()
--  Aggregerer nøkkeltall per selger for et gitt tidsrom. Brukes til
--  ledertavler filtrert per dag/uke/måned/kvartal/år (klienten sender
--  start/slutt basert på valgt periode).
-- ---------------------------------------------------------------------------
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
    coalesce(d.rejections_count, 0)   as rejections_count,
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
      count(*) filter (where stage = 'akseptert') as sales_count,
      count(*) filter (where stage = 'tapt')      as rejections_count,
      sum(amount) filter (where stage = 'akseptert') as sales_amount
    from public.deals
    where updated_at >= p_start and updated_at < p_end
    group by agent_id
  ) d on d.agent_id = p.id
  where p.role = 'agent' and p.is_active
  order by sales_count desc, meetings_confirmed desc, calls_count desc;
$$;

comment on function public.get_leaderboard is 'Aggregert ledertavle for et tidsrom (dag/uke/måned/kvartal/år styres av klienten).';
