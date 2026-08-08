-- ============================================================================
--  0028_communication_settings.sql
--
--  Kommunikasjonsoppsett: SMS-avtalepåminnelser (kunde/selger) og e-post-
--  leveranse-hygiene (domene-oppsett, hendelseslogg, sperreliste). Ingen
--  hemmeligheter lagres her — kun ikke-sensitiv konfigurasjon (avsendernavn,
--  domener, maler, terskler). Ekte API-nøkler forblir miljøvariabler.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  ORGANIZATION: kommunikasjonsinnstillinger (singleton, gjenbruker id = 1)
-- ---------------------------------------------------------------------------
alter table public.organization
  add column if not exists timezone text not null default 'Europe/Oslo',
  -- E-post
  add column if not exists email_from_name text,
  add column if not exists email_from_address text,
  add column if not exists email_reply_to text,
  add column if not exists email_link_domain text,
  -- SMS
  add column if not exists sms_from_name text,
  add column if not exists sms_default_phone text,
  add column if not exists sms_reminders_enabled boolean not null default false,
  add column if not exists sms_reminder_recipients text not null default 'both',
  add column if not exists sms_reminder_offsets_hours integer[] not null default '{24,1}',
  add column if not exists sms_template_customer text,
  add column if not exists sms_template_agent text,
  add constraint organization_sms_reminder_recipients_check
    check (sms_reminder_recipients in ('customer', 'agent', 'both'));

comment on column public.organization.sms_reminder_offsets_hours is
  'Timer før avtalestart hver påminnelse skal sendes, f.eks. {24,1}.';
comment on column public.organization.sms_template_customer is
  'Mal med variabler {{kundenavn}} {{selgernavn}} {{dato}} {{klokkeslett}} {{sted}} {{bedrift}}.';

-- ---------------------------------------------------------------------------
--  CUSTOMERS: enkel opt-out for SMS (behandlingsgrunnlag for påminnelser er
--  ellers den løpende kunderelasjonen/avtalen — reservasjon respekteres).
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists sms_opt_out boolean not null default false;

-- ---------------------------------------------------------------------------
--  APPOINTMENT_SMS_REMINDERS
--  Én rad pr. (avtale, mottakertype, forhåndsvarsel). Idempotens-nøkkelen er
--  den naturlige kombinasjonen av disse tre, håndhevet med en unik indeks —
--  dobbel planlegging av samme påminnelse er derfor umulig på DB-nivå.
-- ---------------------------------------------------------------------------
create table public.appointment_sms_reminders (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references public.appointments (id) on delete cascade,
  recipient_type  text not null check (recipient_type in ('customer', 'agent')),
  offset_hours    integer not null check (offset_hours > 0),
  phone_number    text not null,
  send_at         timestamptz not null,
  status          text not null default 'scheduled'
                    check (status in ('scheduled', 'sent', 'delivered', 'failed', 'cancelled')),
  provider        text,
  provider_ref    text,
  error           text,
  attempt_count   integer not null default 0,
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint appointment_sms_reminders_idempotency_key unique (idempotency_key)
);

create index appointment_sms_reminders_due_idx
  on public.appointment_sms_reminders (status, send_at);
create index appointment_sms_reminders_appointment_idx
  on public.appointment_sms_reminders (appointment_id);

drop trigger if exists appointment_sms_reminders_set_updated_at
  on public.appointment_sms_reminders;
create trigger appointment_sms_reminders_set_updated_at
  before update on public.appointment_sms_reminders
  for each row execute function public.set_updated_at();

alter table public.appointment_sms_reminders enable row level security;

-- Følger avtalens tilgang (leder ser alle, selger ser egne).
create policy appointment_sms_reminders_select on public.appointment_sms_reminders
  for select to authenticated
  using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_sms_reminders.appointment_id
        and (public.is_manager() or a.agent_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
--  Trigger: hold appointment_sms_reminders synkronisert med avtalen.
--
--  * INSERT (og UPDATE av starts_at/status/customer_id/agent_id): planlegg på
--    nytt ut fra gjeldende organisasjonsinnstillinger og fjern rader for
--    mottakertyper som ikke lenger er valgt. Rører ALDRI rader som allerede
--    er sendt/levert/mislykket (kun 'scheduled' oppdateres/slettes).
--  * Avlyst avtale (status = 'avlyst'): kanseller gjenstående planlagte rader.
--  * Slettet avtale: rader fjernes automatisk via on delete cascade.
-- ---------------------------------------------------------------------------
create or replace function public.sync_appointment_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org record;
  cust record;
  agent_phone text;
  offset_h integer;
  want_customer boolean;
  want_agent boolean;
begin
  if new.status = 'avlyst' then
    update public.appointment_sms_reminders
      set status = 'cancelled'
      where appointment_id = new.id and status = 'scheduled';
    return new;
  end if;

  select * into org from public.organization where id = 1;
  if org is null or not org.sms_reminders_enabled then
    -- Reminders av: fjern ev. tidligere planlagte (fortsatt uendret sendte).
    update public.appointment_sms_reminders
      set status = 'cancelled'
      where appointment_id = new.id and status = 'scheduled';
    return new;
  end if;

  want_customer := org.sms_reminder_recipients in ('customer', 'both');
  want_agent := org.sms_reminder_recipients in ('agent', 'both');

  if new.customer_id is not null then
    select phone, sms_opt_out into cust from public.customers where id = new.customer_id;
  end if;
  select phone into agent_phone from public.profiles where id = new.agent_id;

  -- Kanseller planlagte rader for mottakertyper/tidspunkt som ikke lenger er
  -- gyldige (recipients-innstilling endret, avtale flyttet til fortiden, osv.).
  update public.appointment_sms_reminders r
    set status = 'cancelled'
    where r.appointment_id = new.id
      and r.status = 'scheduled'
      and (
        (r.recipient_type = 'customer' and (not want_customer or cust is null or coalesce(cust.sms_opt_out, true) or cust.phone is null))
        or (r.recipient_type = 'agent' and (not want_agent or agent_phone is null))
      );

  foreach offset_h in array org.sms_reminder_offsets_hours loop
    if want_customer and cust.phone is not null and not coalesce(cust.sms_opt_out, false)
       and new.starts_at - (offset_h || ' hours')::interval > now() then
      insert into public.appointment_sms_reminders
        (appointment_id, recipient_type, offset_hours, phone_number, send_at, idempotency_key)
      values
        (new.id, 'customer', offset_h, cust.phone,
         new.starts_at - (offset_h || ' hours')::interval,
         new.id::text || ':customer:' || offset_h::text)
      on conflict (idempotency_key) do update
        set send_at = excluded.send_at,
            phone_number = excluded.phone_number,
            status = 'scheduled'
        where appointment_sms_reminders.status = 'scheduled';
    end if;

    if want_agent and agent_phone is not null
       and new.starts_at - (offset_h || ' hours')::interval > now() then
      insert into public.appointment_sms_reminders
        (appointment_id, recipient_type, offset_hours, phone_number, send_at, idempotency_key)
      values
        (new.id, 'agent', offset_h, agent_phone,
         new.starts_at - (offset_h || ' hours')::interval,
         new.id::text || ':agent:' || offset_h::text)
      on conflict (idempotency_key) do update
        set send_at = excluded.send_at,
            phone_number = excluded.phone_number,
            status = 'scheduled'
        where appointment_sms_reminders.status = 'scheduled';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists appointments_sync_reminders_ins on public.appointments;
create trigger appointments_sync_reminders_ins
  after insert on public.appointments
  for each row execute function public.sync_appointment_reminders();

drop trigger if exists appointments_sync_reminders_upd on public.appointments;
create trigger appointments_sync_reminders_upd
  after update of starts_at, status, customer_id, agent_id on public.appointments
  for each row execute function public.sync_appointment_reminders();

-- ---------------------------------------------------------------------------
--  EMAIL_EVENTS  (leveransehendelser fra e-postleverandøren)
-- ---------------------------------------------------------------------------
create type email_event_type as enum (
  'queued', 'sent', 'accepted', 'delivered',
  'soft_bounced', 'hard_bounced', 'complained', 'opened'
);

create table public.email_events (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid references public.contracts (id) on delete set null,
  recipient           text not null,
  event_type          email_event_type not null,
  provider            text,
  provider_message_id text,
  meta                jsonb not null default '{}'::jsonb,
  occurred_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index email_events_contract_idx on public.email_events (contract_id);
create index email_events_provider_message_idx on public.email_events (provider_message_id);

alter table public.email_events enable row level security;

create policy email_events_select on public.email_events
  for select to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.contracts c
      where c.id = email_events.contract_id
        and public.can_access_customer(c.customer_id)
    )
  );

-- ---------------------------------------------------------------------------
--  EMAIL_SUPPRESSIONS  (sperreliste — harde avvisninger, spamklager, manuelt)
-- ---------------------------------------------------------------------------
create table public.email_suppressions (
  email      text primary key,
  reason     text not null check (reason in ('hard_bounce', 'complaint', 'manual')),
  source     text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;

-- Ledere administrerer sperrelisten direkte; vanlige selgere sjekker den kun
-- indirekte via is_email_suppressed() (security definer, se under).
create policy email_suppressions_select on public.email_suppressions
  for select to authenticated
  using (public.is_manager());
create policy email_suppressions_insert on public.email_suppressions
  for insert to authenticated
  with check (public.is_manager());
create policy email_suppressions_delete on public.email_suppressions
  for delete to authenticated
  using (public.is_manager());

-- Lar enhver innlogget bruker sjekke ETT enkelt adresse-oppslag (boolean) uten
-- å kunne lese hele sperrelisten – brukes av utsendingsruten før sending.
create or replace function public.is_email_suppressed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.email_suppressions where email = lower(trim(p_email))
  );
$$;

-- ---------------------------------------------------------------------------
--  SETTINGS_AUDIT_LOG  (hvem endret kommunikasjonsoppsettet, og når)
-- ---------------------------------------------------------------------------
create table public.settings_audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles (id) on delete set null,
  area       text not null,
  summary    text not null,
  created_at timestamptz not null default now()
);

alter table public.settings_audit_log enable row level security;

create policy settings_audit_log_select on public.settings_audit_log
  for select to authenticated
  using (public.is_manager());
create policy settings_audit_log_insert on public.settings_audit_log
  for insert to authenticated
  with check (public.is_manager());

-- ---------------------------------------------------------------------------
--  Realtime for reminder-status (viser status live i kalender/meldingslogg).
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.appointment_sms_reminders;
