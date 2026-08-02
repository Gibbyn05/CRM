-- ============================================================================
--  0015_reachr_leads.sql
--  Prospekter hentet fra offentlige norske bedriftskilder.
--  Brukes av CRM-fanen "Reachr": Leadssøk -> Mine leads.
-- ============================================================================

create table if not exists public.reachr_leads (
  id                             uuid primary key default gen_random_uuid(),
  owner_id                       uuid not null references public.profiles (id) on delete cascade,
  org_number                     char(9) not null,
  name                           text not null,
  organization_form_code          text,
  organization_form               text,
  industry_code                   text,
  industry                        text,
  employees                       integer,
  website                         text,
  email                           text,
  phone                           text,
  founded_at                      date,
  vat_registered                  boolean not null default false,
  business_register_registered    boolean not null default false,
  bankrupt                        boolean not null default false,
  under_liquidation               boolean not null default false,
  purpose                         text,
  address                         text,
  postal_code                     text,
  city                            text,
  municipality                    text,
  financial_year                  text,
  revenue                         numeric(14, 2),
  operating_result                numeric(14, 2),
  annual_result                   numeric(14, 2),
  equity                          numeric(14, 2),
  assets                          numeric(14, 2),
  debt                            numeric(14, 2),
  roles                           jsonb not null default '[]'::jsonb,
  status                          text not null default 'Ikke kontaktet',
  source                          text not null default 'Brreg',
  notes                           text,
  last_contacted_at               timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),

  constraint reachr_leads_org_number_digits check (org_number ~ '^[0-9]{9}$'),
  constraint reachr_leads_status_check check (
    status in ('Ikke kontaktet', 'Kontaktet', 'Ikke svar', 'Booket møte', 'Avslått', 'Kunde')
  ),
  constraint reachr_leads_owner_org_unique unique (owner_id, org_number)
);

comment on table public.reachr_leads is
  'Prospekter lagret fra Reachr leadssøk. Selger ser egne leads, leder ser alle.';

create index if not exists reachr_leads_owner_idx on public.reachr_leads (owner_id, updated_at desc);
create index if not exists reachr_leads_org_number_idx on public.reachr_leads (org_number);
create index if not exists reachr_leads_status_idx on public.reachr_leads (status);
create index if not exists reachr_leads_industry_code_idx on public.reachr_leads (industry_code);
create index if not exists reachr_leads_city_idx on public.reachr_leads (city);
create index if not exists reachr_leads_name_search_idx
  on public.reachr_leads using gin (to_tsvector('simple', name));

drop trigger if exists reachr_leads_set_updated_at on public.reachr_leads;
create trigger reachr_leads_set_updated_at
  before update on public.reachr_leads
  for each row execute function public.set_updated_at();

alter table public.reachr_leads enable row level security;

drop policy if exists reachr_leads_select on public.reachr_leads;
create policy reachr_leads_select on public.reachr_leads
  for select to authenticated
  using (public.is_manager() or owner_id = auth.uid());

drop policy if exists reachr_leads_insert on public.reachr_leads;
create policy reachr_leads_insert on public.reachr_leads
  for insert to authenticated
  with check (owner_id = auth.uid() or public.is_manager());

drop policy if exists reachr_leads_update on public.reachr_leads;
create policy reachr_leads_update on public.reachr_leads
  for update to authenticated
  using (public.is_manager() or owner_id = auth.uid())
  with check (public.is_manager() or owner_id = auth.uid());

drop policy if exists reachr_leads_delete on public.reachr_leads;
create policy reachr_leads_delete on public.reachr_leads
  for delete to authenticated
  using (public.is_manager() or owner_id = auth.uid());

grant select, insert, update, delete on public.reachr_leads to authenticated;
