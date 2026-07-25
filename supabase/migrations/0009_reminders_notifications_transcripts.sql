-- ============================================================================
--  0009_reminders_notifications_transcripts.sql
--  Tre nye funksjonsområder:
--   1. reminders        – oppfølging/påminnelser pr. selger (evt. koblet kunde)
--   2. notifications    – ekte varsler (bjella), fylles av triggere/tjenester
--   3. call_transcripts – live sanntids-transkript fra samtaler (ICE-integrasjon)
-- ============================================================================

-- ---------------------------------------------------------------------------
--  ENUMS
-- ---------------------------------------------------------------------------
create type notification_type as enum (
  'message', 'reminder', 'contract', 'appointment', 'deal', 'system'
);
create type transcript_speaker as enum ('agent', 'customer', 'system');

-- ---------------------------------------------------------------------------
--  REMINDERS
-- ---------------------------------------------------------------------------
create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  created_by  uuid references public.profiles (id) on delete set null,
  title       text not null,
  note        text,
  due_at      timestamptz not null,
  done        boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index reminders_agent_idx on public.reminders (agent_id, done, due_at);

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
--  NOTIFICATIONS
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       notification_type not null default 'system',
  title      text not null,
  body       text,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx
  on public.notifications (user_id, read, created_at desc);

-- ---------------------------------------------------------------------------
--  CALL_TRANSCRIPTS  (live transkript fra ICE)
-- ---------------------------------------------------------------------------
create table public.call_transcripts (
  id               uuid primary key default gen_random_uuid(),
  call_log_id      uuid references public.call_logs (id) on delete cascade,
  external_call_id text,
  agent_id         uuid references public.profiles (id) on delete set null,
  customer_id      uuid references public.customers (id) on delete set null,
  speaker          transcript_speaker not null default 'system',
  text             text not null,
  is_final         boolean not null default true,
  seq              integer,
  spoken_at        timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index call_transcripts_call_idx
  on public.call_transcripts (call_log_id, spoken_at);
create index call_transcripts_customer_idx
  on public.call_transcripts (customer_id, spoken_at);
create index call_transcripts_ext_idx
  on public.call_transcripts (external_call_id, spoken_at);

-- ---------------------------------------------------------------------------
--  RLS
-- ---------------------------------------------------------------------------
alter table public.reminders        enable row level security;
alter table public.notifications    enable row level security;
alter table public.call_transcripts enable row level security;

-- Reminders: selger ser/endrer egne; leder ser alle.
create policy reminders_select on public.reminders
  for select to authenticated
  using (public.is_manager() or agent_id = auth.uid());
create policy reminders_insert on public.reminders
  for insert to authenticated
  with check (created_by = auth.uid() and (agent_id = auth.uid() or public.is_manager()));
create policy reminders_update on public.reminders
  for update to authenticated
  using (public.is_manager() or agent_id = auth.uid())
  with check (public.is_manager() or agent_id = auth.uid());
create policy reminders_delete on public.reminders
  for delete to authenticated
  using (public.is_manager() or agent_id = auth.uid());

-- Notifications: hver bruker ser/endrer kun sine egne. Ingen INSERT-policy –
-- varsler opprettes kun av SECURITY DEFINER-triggere eller service-role.
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- Transkript: selger ser egne samtaler; leder ser alle. Skriving via service-role.
create policy call_transcripts_select on public.call_transcripts
  for select to authenticated
  using (public.is_manager() or agent_id = auth.uid());

-- ---------------------------------------------------------------------------
--  Varsel-hjelpefunksjon + triggere
-- ---------------------------------------------------------------------------
create or replace function public.create_notification(
  p_user uuid, p_type notification_type, p_title text, p_body text, p_link text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_user is null then return null; end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user, p_type, p_title, p_body, p_link)
  returning id into v_id;
  return v_id;
end; $$;

-- Direktemelding -> varsle mottaker.
create or replace function public.notify_direct_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.channel = 'direct' and new.recipient_id is not null
     and new.recipient_id <> new.author_id then
    select coalesce(full_name, email, 'En kollega') into v_name
      from public.profiles where id = new.author_id;
    perform public.create_notification(
      new.recipient_id, 'message',
      'Ny melding fra ' || coalesce(v_name, 'kollega'),
      left(new.body, 120), '/profile/team');
  end if;
  return new;
end; $$;
create trigger messages_notify_direct
  after insert on public.messages
  for each row execute function public.notify_direct_message();

-- Kontrakt åpnet/signert -> varsle ansvarlig selger.
create or replace function public.notify_contract_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.status is distinct from old.status
     and new.status in ('opened', 'signed') and new.agent_id is not null then
    select name into v_name from public.customers where id = new.customer_id;
    perform public.create_notification(
      new.agent_id, 'contract',
      case when new.status = 'signed' then 'Kontrakt signert' else 'Kontrakt åpnet' end,
      coalesce(v_name, 'Kunde'),
      '/customers/' || new.customer_id::text);
  end if;
  return new;
end; $$;
create trigger contracts_notify_status
  after update on public.contracts
  for each row execute function public.notify_contract_status();

-- Påminnelse tildelt av leder til en annen -> varsle mottaker.
create or replace function public.notify_reminder_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null and new.created_by <> new.agent_id then
    perform public.create_notification(
      new.agent_id, 'reminder', 'Ny påminnelse', new.title, '/reminders');
  end if;
  return new;
end; $$;
create trigger reminders_notify_assigned
  after insert on public.reminders
  for each row execute function public.notify_reminder_assigned();

-- ---------------------------------------------------------------------------
--  Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.reminders;
alter publication supabase_realtime add table public.call_transcripts;
