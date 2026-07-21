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
create type message_channel as enum ('team', 'customer');

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
  body        text not null,
  created_at  timestamptz not null default now(),

  constraint customer_channel_requires_customer
    check (channel <> 'customer' or customer_id is not null)
);

comment on table public.messages is 'Intern chat (team-boble) og kommentarer på spesifikke kunde-caser.';

create index messages_channel_idx on public.messages (channel, created_at desc);
create index messages_customer_idx on public.messages (customer_id, created_at desc);

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
