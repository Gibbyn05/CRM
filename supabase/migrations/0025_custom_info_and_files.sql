-- ============================================================================
--  0025_custom_info_and_files.sql
--  Kundekort-faner:
--   - «Egendefinert info»: fritt definerte felt (label/verdi) på kunden.
--   - «Filer»: opplasting av dokumenter knyttet til kunden.
-- ============================================================================

-- Egendefinert info: liste av { label, value } lagret som JSONB på kunden.
alter table public.customers
  add column if not exists custom_info jsonb not null default '[]'::jsonb;

comment on column public.customers.custom_info is
  'Egendefinerte felt på kunden: [{ "label": "...", "value": "..." }].';

-- ---------------------------------------------------------------------------
--  Filer knyttet til en kunde (metadata; selve fila i storage-bucketen).
-- ---------------------------------------------------------------------------
create table if not exists public.customer_files (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers (id) on delete cascade,
  name         text not null,
  path         text not null, -- sti i storage-bucketen «customer-files»
  size         bigint,
  mime         text,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists customer_files_customer_idx
  on public.customer_files (customer_id);

alter table public.customer_files enable row level security;

-- Tilgang følger kunden (samme regler som resten av kundedata).
drop policy if exists customer_files_select on public.customer_files;
create policy customer_files_select on public.customer_files
  for select to authenticated
  using (public.can_access_customer(customer_id));

drop policy if exists customer_files_insert on public.customer_files;
create policy customer_files_insert on public.customer_files
  for insert to authenticated
  with check (public.can_access_customer(customer_id));

drop policy if exists customer_files_delete on public.customer_files;
create policy customer_files_delete on public.customer_files
  for delete to authenticated
  using (public.can_access_customer(customer_id));

-- ---------------------------------------------------------------------------
--  Storage: privat bucket for kundefiler (nedlasting via signert URL).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('customer-files', 'customer-files', false)
on conflict (id) do nothing;

drop policy if exists "customer_files_read" on storage.objects;
create policy "customer_files_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'customer-files');

drop policy if exists "customer_files_write" on storage.objects;
create policy "customer_files_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'customer-files');

drop policy if exists "customer_files_remove" on storage.objects;
create policy "customer_files_remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'customer-files');
