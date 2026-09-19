-- Sporbar utsendelse og sikker driftskontroll.
-- Alle endringer i disse tabellene gjøres fra sikre server-ruter. Ledere kan
-- kun lese resultatene i CRM-et, og ingen tabell er åpen for anonyme brukere.

create table public.email_delivery_records (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend',
  provider_message_id text unique,
  category text not null check (category in (
    'contract', 'contract_copy', 'contract_expiry', 'invitation', 'daily_report', 'system'
  )),
  recipient text not null,
  subject text not null,
  status text not null default 'sent' check (status in (
    'sent', 'delivered', 'delayed', 'bounced', 'complained', 'opened', 'failed'
  )),
  contract_id uuid references public.contracts(id) on delete set null,
  invitation_id uuid references public.user_invitations(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_delivery_records_created_at_idx
  on public.email_delivery_records (created_at desc);
create index email_delivery_records_recipient_idx
  on public.email_delivery_records (lower(recipient));
create index email_delivery_records_contract_idx
  on public.email_delivery_records (contract_id)
  where contract_id is not null;

drop trigger if exists email_delivery_records_set_updated_at on public.email_delivery_records;
create trigger email_delivery_records_set_updated_at
  before update on public.email_delivery_records
  for each row execute function public.set_updated_at();

alter table public.email_delivery_records enable row level security;
revoke all on public.email_delivery_records from anon;
revoke insert, update, delete on public.email_delivery_records from authenticated;
grant select on public.email_delivery_records to authenticated;
create policy email_delivery_records_manager_select
  on public.email_delivery_records for select to authenticated
  using (public.is_manager());

create table public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  webhook_id text unique,
  delivery_id uuid references public.email_delivery_records(id) on delete set null,
  provider text not null default 'resend',
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index email_delivery_events_delivery_idx
  on public.email_delivery_events (delivery_id, occurred_at desc);

alter table public.email_delivery_events enable row level security;
revoke all on public.email_delivery_events from anon;
revoke insert, update, delete on public.email_delivery_events from authenticated;
grant select on public.email_delivery_events to authenticated;
create policy email_delivery_events_manager_select
  on public.email_delivery_events for select to authenticated
  using (public.is_manager());

create table public.email_suppressions (
  email text primary key check (email = lower(trim(email))),
  reason text not null check (reason in ('hard_bounce', 'complaint', 'manual')),
  source text not null default 'crm',
  created_at timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from anon;
revoke insert, update, delete on public.email_suppressions from authenticated;
grant select on public.email_suppressions to authenticated;
create policy email_suppressions_manager_select
  on public.email_suppressions for select to authenticated
  using (public.is_manager());

create table public.operations_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('access', 'email', 'recovery', 'configuration')),
  action text not null,
  target_type text,
  target_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index operations_audit_events_created_at_idx
  on public.operations_audit_events (created_at desc);

alter table public.operations_audit_events enable row level security;
revoke all on public.operations_audit_events from anon;
revoke insert, update, delete on public.operations_audit_events from authenticated;
grant select on public.operations_audit_events to authenticated;
create policy operations_audit_events_manager_select
  on public.operations_audit_events for select to authenticated
  using (public.is_manager());

create table public.recovery_checkpoints (
  id uuid primary key default gen_random_uuid(),
  check_type text not null unique check (check_type in ('backup_restore')),
  checked_at timestamptz not null,
  checked_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists recovery_checkpoints_set_updated_at on public.recovery_checkpoints;
create trigger recovery_checkpoints_set_updated_at
  before update on public.recovery_checkpoints
  for each row execute function public.set_updated_at();

alter table public.recovery_checkpoints enable row level security;
revoke all on public.recovery_checkpoints from anon;
revoke insert, update, delete on public.recovery_checkpoints from authenticated;
grant select on public.recovery_checkpoints to authenticated;
create policy recovery_checkpoints_manager_select
  on public.recovery_checkpoints for select to authenticated
  using (public.is_manager());
