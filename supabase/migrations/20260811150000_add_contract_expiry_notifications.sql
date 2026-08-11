alter table public.contracts
  add column if not exists agreement_end date;

alter table public.deals
  add column if not exists agreement_end date;

comment on column public.contracts.agreement_end is
  'Avtalens sluttdato. Brukes til varsling før avtalen utløper.';
comment on column public.deals.agreement_end is
  'Avtalens valgte sluttdato før kontrakten sendes til signering.';

create index if not exists contracts_agreement_end_idx
  on public.contracts (agreement_end)
  where status = 'signed' and agreement_end is not null;

create table if not exists public.contract_expiry_deliveries (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  notice_days integer not null default 30 check (notice_days between 1 and 365),
  in_app_created_at timestamptz,
  email_sent_at timestamptz,
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, user_id, notice_days)
);

comment on table public.contract_expiry_deliveries is
  'Idempotens og leveringsstatus for varsler om utløpende avtaler.';

create index if not exists contract_expiry_deliveries_retry_idx
  on public.contract_expiry_deliveries (email_sent_at, created_at)
  where email_sent_at is null;

alter table public.contract_expiry_deliveries enable row level security;

revoke all on public.contract_expiry_deliveries from anon, authenticated;

create trigger contract_expiry_deliveries_set_updated_at
  before update on public.contract_expiry_deliveries
  for each row execute function public.set_updated_at();
