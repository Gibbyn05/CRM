-- ============================================================================
--  0014_dagsavis_enhancements.sql
--  Utvider dagsavis-modellen med:
--   - ekstra nøkkeltall per selger
--   - egen team-oppsummering for ledervisning
-- ============================================================================

alter table public.daily_reports
  add column if not exists revenue_amount numeric(12, 2) not null default 0,
  add column if not exists new_customers_count integer not null default 0,
  add column if not exists booked_meetings_count integer not null default 0;

create table if not exists public.daily_team_reports (
  id                  uuid primary key default gen_random_uuid(),
  report_date         date not null unique,
  calls_count         integer not null default 0,
  meetings_confirmed   integer not null default 0,
  sales_count         integer not null default 0,
  revenue_amount      numeric(12, 2) not null default 0,
  new_customers_count integer not null default 0,
  booked_meetings_count integer not null default 0,
  rejections_count    integer not null default 0,
  summary_text        text,
  metrics             jsonb not null default '{}'::jsonb,
  generated_at        timestamptz,
  created_at          timestamptz not null default now()
);

comment on table public.daily_team_reports is 'Daglig team-oppsummering for ledervisning i Dagsavis.';

create index if not exists daily_team_reports_date_idx
  on public.daily_team_reports (report_date desc);

alter table public.daily_team_reports enable row level security;

drop policy if exists daily_team_reports_select on public.daily_team_reports;
create policy daily_team_reports_select on public.daily_team_reports
  for select to authenticated
  using (public.is_manager());
