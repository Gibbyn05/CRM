-- ============================================================================
--  schema.sql  —  Samlet databaseskjema for callcenter sales-dashboard.
--  Lim inn HELE denne fila i Supabase → SQL Editor → New query → Run.
--  (Genereres fra supabase/migrations/*.sql — ikke rediger manuelt.)
-- ============================================================================


-- >>>>>>>>>>>>>>>>  supabase/migrations/0001_initial_schema.sql  >>>>>>>>>>>>>>>>

-- ============================================================================
--  0001_initial_schema.sql
--  Datamodell for callcenter sales-dashboard (norsk B2B-salg).
--
--  Kjernetabeller: profiles (agenter/ledere), agent_states (live-status),
--  customers, call_logs, notes, deals (tilbud/salg), appointments (kalender),
--  contracts (kontrakt-utsendelse), messages (intern chat), daily_reports
--  (AI-generert dagsavis).
--
--  Designet for å utvides: call_logs bærer rå telefoni-hendelser fra en
--  abstrahert kilde (Bria/Ice), slik at detaljert samtaledata kan kobles på
--  senere uten skjemaendringer i resten av modellen.
-- ============================================================================

-- Nyttige extensions (uuid-generering finnes normalt allerede i Supabase).
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
--  ENUMS
-- ---------------------------------------------------------------------------

-- Rollebasert tilgang: vanlig selger vs. salgssjef.
create type user_role as enum ('agent', 'manager');

-- Live agent-status vist på storskjerm.
--   in_call     = i samtale
--   available   = ledig (klar for neste samtale)
--   not_in_call = ikke i samtale (pause / etterarbeid)
--   offline     = frakoblet / ikke logget på softphone
create type agent_status as enum ('in_call', 'available', 'not_in_call', 'offline');

-- Retning på samtalen.
create type call_direction as enum ('inbound', 'outbound');

-- Livssyklus for en enkelt samtale (utledet fra telefoni-hendelser).
create type call_status as enum ('ringing', 'answered', 'ended', 'missed');

-- Pipeline-steg (Kanban): Ringt -> Tilbud sendt -> Akseptert -> Tapt.
create type deal_stage as enum ('ringt', 'tilbud_sendt', 'akseptert', 'tapt');

-- Avtaletype i kalenderen.
create type appointment_type as enum (
  'oppfolgingsmote',
  'demo',
  'kontraktssignering',
  'forstegangsmote',
  'annet'
);

-- Status for en booket avtale.
create type appointment_status as enum ('planlagt', 'bekreftet', 'gjennomfort', 'avlyst', 'no_show');

-- Kontrakt-utsendelse.
create type contract_channel as enum ('email', 'sms');
create type contract_status as enum ('draft', 'sent', 'opened', 'signed', 'declined');

-- Notat-type på kundekortet (utvidbar for fremtidig samtale-analyse).
create type note_type as enum ('call', 'general', 'system', 'meeting');

-- Chat-kanal: 'team' = felles boble, 'customer' = kommentar på en kunde-case.
create type message_channel as enum ('team', 'customer', 'direct');

-- ---------------------------------------------------------------------------
--  PROFILES  (utvider auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text not null default '',
  email        text not null default '',
  role         user_role not null default 'agent',
  phone        text,
  -- Telefoni-mapping: internnummer/extension eller Bria-bruker-id som brukes
  -- til å knytte innkommende telefoni-hendelser til riktig agent.
  extension    text unique,
  avatar_url   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is 'Ansatte (selgere/salgssjefer). 1:1 med auth.users.';
comment on column public.profiles.extension is 'Softphone extension / Bria-id for kobling av telefoni-hendelser.';

-- ---------------------------------------------------------------------------
--  AGENT_STATES  (live-status, egen tabell for lette realtime-oppdateringer)
-- ---------------------------------------------------------------------------
create table public.agent_states (
  agent_id             uuid primary key references public.profiles (id) on delete cascade,
  status               agent_status not null default 'offline',
  -- Peker til pågående samtale (hvis status = in_call).
  current_call_id      uuid,
  -- Tidspunkt for siste samtale-start / -slutt — driver "hvor lenge siden
  -- de sist ringte" på storskjermen.
  last_call_started_at timestamptz,
  last_call_ended_at   timestamptz,
  -- Når status sist endret seg (for "X min i denne statusen").
  status_changed_at    timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.agent_states is 'Sanntids agent-status for live-dashboard/TV-visning.';

-- ---------------------------------------------------------------------------
--  CUSTOMERS  (kundekort)
-- ---------------------------------------------------------------------------
create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  -- Norsk organisasjonsnummer: nøyaktig 9 siffer.
  org_number    char(9),
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  postal_code   text,
  city          text,
  -- Tildelt selger. Selgere ser primært sine egne kunder (se RLS).
  owner_id      uuid references public.profiles (id) on delete set null,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint org_number_9_digits
    check (org_number is null or org_number ~ '^[0-9]{9}$')
);

comment on table public.customers is 'Kundedatabase, søkbar på navn og organisasjonsnummer.';

-- Søk på navn (case-insensitivt prefiks/ILIKE) og org.nr.
create index customers_name_idx on public.customers using gin (to_tsvector('simple', name));
create index customers_name_trgm_idx on public.customers (lower(name));
create index customers_org_number_idx on public.customers (org_number);
create index customers_owner_idx on public.customers (owner_id);

-- ---------------------------------------------------------------------------
--  CALL_LOGS  (abstrahert telefoni-hendelsessink)
--  Bria/Ice sender call_started / call_answered / call_ended osv. til
--  webhook-endepunktet, som skriver/oppdaterer rader her.
-- ---------------------------------------------------------------------------
create table public.call_logs (
  id               uuid primary key default gen_random_uuid(),
  -- Ekstern samtale-id fra telefoni-kilden (idempotens-nøkkel).
  external_call_id text,
  agent_id         uuid references public.profiles (id) on delete set null,
  customer_id      uuid references public.customers (id) on delete set null,
  direction        call_direction not null default 'outbound',
  status           call_status not null default 'ringing',
  phone_number     text,
  started_at       timestamptz,
  answered_at      timestamptz,
  ended_at         timestamptz,
  duration_seconds integer,
  -- Rå payload fra telefoni-kilden, for fremtidig samtale-analyse.
  raw_payload      jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (external_call_id)
);

comment on table public.call_logs is 'Samtaler utledet fra telefoni-hendelser. raw_payload gir rom for fremtidig samtale-analyse.';

create index call_logs_agent_idx on public.call_logs (agent_id, started_at desc);
create index call_logs_customer_idx on public.call_logs (customer_id, started_at desc);
create index call_logs_started_idx on public.call_logs (started_at desc);

-- Kobling: agent_states.current_call_id -> call_logs.id (satt etter begge finnes).
alter table public.agent_states
  add constraint agent_states_current_call_fk
  foreign key (current_call_id) references public.call_logs (id) on delete set null;

-- ---------------------------------------------------------------------------
--  NOTES  (samtalelogg på kundekortet)
-- ---------------------------------------------------------------------------
create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers (id) on delete cascade,
  author_id    uuid references public.profiles (id) on delete set null,
  -- Valgfri kobling til en spesifikk samtale.
  call_log_id  uuid references public.call_logs (id) on delete set null,
  note_type    note_type not null default 'general',
  body         text not null,
  created_at   timestamptz not null default now()
);

comment on table public.notes is 'Kronologisk logg av notater/interaksjoner per kunde.';

create index notes_customer_idx on public.notes (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
--  DEALS  (tilbud / salgsstatus / pipeline)
-- ---------------------------------------------------------------------------
create table public.deals (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers (id) on delete cascade,
  agent_id          uuid references public.profiles (id) on delete set null,
  title             text not null,
  stage             deal_stage not null default 'ringt',
  amount            numeric(12, 2),
  currency          text not null default 'NOK',
  -- Salgsstatus-sporing: tilbud sendt / akseptert.
  offer_sent_at     timestamptz,
  offer_accepted_at timestamptz,
  lost_reason       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.deals is 'Tilbud/salg med Kanban-pipeline (ringt/tilbud_sendt/akseptert/tapt).';

create index deals_customer_idx on public.deals (customer_id);
create index deals_agent_idx on public.deals (agent_id);
create index deals_stage_idx on public.deals (stage);

-- ---------------------------------------------------------------------------
--  APPOINTMENTS  (kalender)
-- ---------------------------------------------------------------------------
create table public.appointments (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  title       text not null,
  type        appointment_type not null default 'annet',
  status      appointment_status not null default 'planlagt',
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  location    text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.appointments is 'Booking av avtaler/møter, koblet til kundekort.';

create index appointments_agent_idx on public.appointments (agent_id, starts_at);
create index appointments_customer_idx on public.appointments (customer_id);
create index appointments_starts_idx on public.appointments (starts_at);

-- ---------------------------------------------------------------------------
--  CONTRACTS  (kontrakt-utsendelse + status-sporing)
-- ---------------------------------------------------------------------------
create table public.contracts (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers (id) on delete cascade,
  deal_id       uuid references public.deals (id) on delete set null,
  agent_id      uuid references public.profiles (id) on delete set null,
  channel       contract_channel not null,
  recipient     text not null, -- e-postadresse eller mobilnummer
  status        contract_status not null default 'draft',
  sent_at       timestamptz,
  opened_at     timestamptz,
  signed_at     timestamptz,
  -- Leverandør (e-post/SMS/e-signatur) og deres referanse-id for sporing.
  provider      text,
  provider_ref  text,
  document_url  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.contracts is 'Kontrakter sendt via e-post/SMS med status: sendt/åpnet/signert.';

create index contracts_customer_idx on public.contracts (customer_id);
create index contracts_deal_idx on public.contracts (deal_id);

-- ---------------------------------------------------------------------------
--  MESSAGES  (intern chat + kommentarer på kunde-case)
-- ---------------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid references public.profiles (id) on delete set null,
  channel     message_channel not null default 'team',
  -- Satt når channel = 'customer' (kommentar knyttet til et kundekort).
  customer_id uuid references public.customers (id) on delete cascade,
  -- Satt når channel = 'direct' (mottaker av direktemelding).
  recipient_id uuid references public.profiles (id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),

  constraint customer_channel_requires_customer
    check (channel <> 'customer' or customer_id is not null)
);

comment on table public.messages is 'Intern chat (team-boble) og kommentarer på spesifikke kunde-caser.';

create index messages_channel_idx on public.messages (channel, created_at desc);
create index messages_customer_idx on public.messages (customer_id, created_at desc);
create index messages_direct_idx on public.messages (channel, author_id, recipient_id, created_at);

-- ---------------------------------------------------------------------------
--  DAILY_REPORTS  (AI-generert dagsavis)
-- ---------------------------------------------------------------------------
create table public.daily_reports (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            uuid not null references public.profiles (id) on delete cascade,
  report_date         date not null,
  calls_count         integer not null default 0,
  meetings_confirmed  integer not null default 0,
  sales_count         integer not null default 0,
  rejections_count    integer not null default 0,
  -- AI-generert tekst-oppsummering (Claude).
  summary_text        text,
  -- Ekstra nøkkeltall / utvidbare felter (f.eks. "hvor i samtalen mistet
  -- flest kunder"), lagret fleksibelt for fremtidig utvidelse.
  metrics             jsonb not null default '{}'::jsonb,
  generated_at        timestamptz,
  created_at          timestamptz not null default now(),

  unique (agent_id, report_date)
);

comment on table public.daily_reports is 'Daglig performance-rapport (dagsavis) per selger, med AI-oppsummering.';

create index daily_reports_agent_date_idx on public.daily_reports (agent_id, report_date desc);

-- >>>>>>>>>>>>>>>>  supabase/migrations/0002_functions_triggers.sql  >>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>  supabase/migrations/0003_rls_policies.sql  >>>>>>>>>>>>>>>>

-- ============================================================================
--  0003_rls_policies.sql
--  Row Level Security. Rollebasert tilgang:
--   - Salgssjef (manager): ser hele teamet — live-dashboard, ledertavler,
--     alle kunder/deals/avtaler.
--   - Selger (agent): ser primært sine egne kunder/kalender/logg, men ser
--     hele live-statustavlen (ingen skal kunne "gjemme seg").
--
--  TV-visningen bruker en egen server-route med service-role og trenger ikke
--  anon-tilgang her.
-- ============================================================================

alter table public.profiles       enable row level security;
alter table public.agent_states   enable row level security;
alter table public.customers      enable row level security;
alter table public.call_logs      enable row level security;
alter table public.notes          enable row level security;
alter table public.deals          enable row level security;
alter table public.appointments   enable row level security;
alter table public.contracts      enable row level security;
alter table public.messages       enable row level security;
alter table public.daily_reports  enable row level security;

-- ---------------------------------------------------------------------------
--  PROFILES
--  Alle innloggede kan lese profiler (nødvendig for navn på tavla/chat).
--  Man kan oppdatere sin egen profil; ledere kan oppdatere alle.
-- ---------------------------------------------------------------------------
create policy profiles_select_all on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_manager())
  with check (id = auth.uid() or public.is_manager());

-- ---------------------------------------------------------------------------
--  AGENT_STATES
--  Alle innloggede kan LESE hele tavla (ingen gjemmer seg). Kun eier eller
--  systemet (service-role) skriver — skriving skjer normalt via RPC/webhook.
-- ---------------------------------------------------------------------------
create policy agent_states_select_all on public.agent_states
  for select to authenticated
  using (true);

create policy agent_states_update_own on public.agent_states
  for update to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

-- ---------------------------------------------------------------------------
--  CUSTOMERS
--  Selger: egne kunder + ikke-tildelte. Salgssjef: alle.
--  Delt kundetilgang: alle innloggede ser og oppdaterer alle kunder (delt
--  team-CRM). Innsett: enhver innlogget. Slett: KUN leder.
-- ---------------------------------------------------------------------------
create policy customers_select on public.customers
  for select to authenticated
  using (true);

create policy customers_insert on public.customers
  for insert to authenticated
  with check (created_by = auth.uid() or public.is_manager());

create policy customers_update on public.customers
  for update to authenticated
  using (true)
  with check (true);

create policy customers_delete on public.customers
  for delete to authenticated
  using (public.is_manager());

-- Hjelpefunksjon: har innlogget bruker tilgang til en kunde?
-- Delt team-CRM: alle innloggede har tilgang (notater/deals/kontrakter/chat).
create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------
--  CALL_LOGS
--  Selger ser egne samtaler; leder ser alle. Skriving skjer via webhook
--  (service-role bypasser RLS), men vi tillater agenten å lese sine.
-- ---------------------------------------------------------------------------
create policy call_logs_select on public.call_logs
  for select to authenticated
  using (public.is_manager() or agent_id = auth.uid());

-- ---------------------------------------------------------------------------
--  NOTES  (følger kunde-tilgang)
-- ---------------------------------------------------------------------------
create policy notes_select on public.notes
  for select to authenticated
  using (public.can_access_customer(customer_id));

create policy notes_insert on public.notes
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_customer(customer_id));

create policy notes_delete on public.notes
  for delete to authenticated
  using (public.is_manager() or author_id = auth.uid());

-- ---------------------------------------------------------------------------
--  DEALS  (følger kunde-tilgang)
-- ---------------------------------------------------------------------------
create policy deals_select on public.deals
  for select to authenticated
  using (public.can_access_customer(customer_id));

create policy deals_insert on public.deals
  for insert to authenticated
  with check (public.can_access_customer(customer_id));

create policy deals_update on public.deals
  for update to authenticated
  using (public.can_access_customer(customer_id))
  with check (public.can_access_customer(customer_id));

create policy deals_delete on public.deals
  for delete to authenticated
  using (public.is_manager() or agent_id = auth.uid());

-- ---------------------------------------------------------------------------
--  APPOINTMENTS
--  Selger ser/endrer egne; leder ser alle.
-- ---------------------------------------------------------------------------
create policy appointments_select on public.appointments
  for select to authenticated
  using (public.is_manager() or agent_id = auth.uid());

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check (agent_id = auth.uid() or public.is_manager());

create policy appointments_update on public.appointments
  for update to authenticated
  using (public.is_manager() or agent_id = auth.uid())
  with check (public.is_manager() or agent_id = auth.uid());

create policy appointments_delete on public.appointments
  for delete to authenticated
  using (public.is_manager() or agent_id = auth.uid());

-- ---------------------------------------------------------------------------
--  CONTRACTS  (følger kunde-tilgang)
-- ---------------------------------------------------------------------------
create policy contracts_select on public.contracts
  for select to authenticated
  using (public.can_access_customer(customer_id));

create policy contracts_insert on public.contracts
  for insert to authenticated
  with check (public.can_access_customer(customer_id));

create policy contracts_update on public.contracts
  for update to authenticated
  using (public.can_access_customer(customer_id))
  with check (public.can_access_customer(customer_id));

-- ---------------------------------------------------------------------------
--  MESSAGES
--  Team-kanal: alle innloggede leser/skriver. Kunde-kanal: kun de med tilgang
--  til kunden.
-- ---------------------------------------------------------------------------
create policy messages_select on public.messages
  for select to authenticated
  using (
    channel = 'team'
    or (channel = 'customer' and public.can_access_customer(customer_id))
    or (channel = 'direct' and (author_id = auth.uid() or recipient_id = auth.uid()))
  );

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      channel = 'team'
      or (channel = 'customer' and public.can_access_customer(customer_id))
      or (channel = 'direct' and recipient_id is not null and recipient_id <> auth.uid())
    )
  );

create policy messages_delete on public.messages
  for delete to authenticated
  using (public.is_manager() or author_id = auth.uid());

-- ---------------------------------------------------------------------------
--  DAILY_REPORTS
--  Selger ser egne dagsaviser; leder ser alle. Generering skjer server-side
--  (service-role) via /api/dagsavis.
-- ---------------------------------------------------------------------------
create policy daily_reports_select on public.daily_reports
  for select to authenticated
  using (public.is_manager() or agent_id = auth.uid());

-- >>>>>>>>>>>>>>>>  supabase/migrations/0004_realtime.sql  >>>>>>>>>>>>>>>>

-- ============================================================================
--  0004_realtime.sql
--  Aktiverer Supabase Realtime for tabellene som driver live-oppdateringer
--  uten refresh: agent_states (live-tavle), messages (chat), notes/deals
--  (kundekort-oppdateringer i sanntid).
--
--  supabase_realtime-publikasjonen finnes normalt allerede i Supabase;
--  vi legger til tabellene idempotent.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end$$;

alter publication supabase_realtime add table public.agent_states;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.deals;
alter publication supabase_realtime add table public.call_logs;

-- REPLICA IDENTITY FULL gjør at gamle verdier følger med i update/delete-
-- hendelser (nyttig for klienten når rader endres).
alter table public.agent_states replica identity full;
alter table public.messages     replica identity full;
alter table public.deals         replica identity full;

-- >>>>>>>>>>>>>>>>  supabase/migrations/0005_storage_avatars.sql  >>>>>>>>>>>>>>>>

-- ============================================================================
--  0005_storage_avatars.sql
--  Storage-bucket for profilbilder (avatarer). Offentlig lesbar; innloggede
--  brukere kan laste opp/erstatte bilder. Filnavn prefikses med bruker-id i
--  appen (f.eks. "<uid>/avatar.png").
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Les: alle (bucket er offentlig).
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

-- Last opp: innloggede brukere.
drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars');

-- Oppdater/erstatt: innloggede brukere.
drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars');

-- ============================================================================
--  Rollebasert dashbord (fra 0006_role_dashboard.sql)
--  Personlige nøkkeltall + samtaler per tidsbøtte. Selgere ser kun egne tall.
-- ============================================================================
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

-- ============================================================================
--  Påminnelser, varsler og live-transkript (fra 0009_reminders_notifications_transcripts.sql)
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

-- ===========================================================================
--  ORGANIZATION  (0010) – singleton med selskapsinfo/branding for maler.
-- ===========================================================================
create table public.organization (
  id               smallint primary key default 1 check (id = 1),
  name             text not null default '',
  org_number       char(9),
  email            text,
  phone            text,
  website          text,
  address          text,
  postal_code      text,
  city             text,
  logo_url         text,
  email_signature  text,
  contract_footer  text,
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint org_number_9_digits
    check (org_number is null or org_number ~ '^[0-9]{9}$')
);

comment on table public.organization is
  'Singleton med selskapsinfo/branding som gjenbrukes i maler. Kun én rad (id=1).';

insert into public.organization (id) values (1) on conflict (id) do nothing;

create trigger organization_set_updated_at
  before update on public.organization
  for each row execute function public.set_updated_at();

alter table public.organization enable row level security;

create policy organization_select on public.organization
  for select to authenticated
  using (true);
create policy organization_insert on public.organization
  for insert to authenticated
  with check (public.is_manager());
create policy organization_update on public.organization
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "branding_read" on storage.objects;
create policy "branding_read" on storage.objects
  for select
  using (bucket_id = 'branding');
drop policy if exists "branding_insert" on storage.objects;
create policy "branding_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and public.is_manager());
drop policy if exists "branding_update" on storage.objects;
create policy "branding_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and public.is_manager());
drop policy if exists "branding_delete" on storage.objects;
create policy "branding_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and public.is_manager());
