-- Daglig, automatisk tildeling av 1881-verifiserte Reachr-leads.
-- Søkeordene og kilde-URLen er revisjonsspor for hvorfor et lead ble tatt med.

alter table public.reachr_leads
  add column if not exists keywords jsonb not null default '[]'::jsonb,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.reachr_daily_lead_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  requested_count integer not null check (requested_count between 1 and 30),
  assigned_count integer not null default 0 check (assigned_count between 0 and 30),
  verification_failures integer not null default 0,
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed')),
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (run_date, owner_id)
);

create index if not exists reachr_daily_lead_runs_owner_date_idx
  on public.reachr_daily_lead_runs (owner_id, run_date desc);

alter table public.reachr_daily_lead_runs enable row level security;

create policy "Managers can read daily Reachr runs"
  on public.reachr_daily_lead_runs for select to authenticated
  using (public.is_manager());

grant select on public.reachr_daily_lead_runs to authenticated;
