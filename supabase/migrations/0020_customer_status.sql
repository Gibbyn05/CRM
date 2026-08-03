-- ============================================================================
--  0020_customer_status.sql
--  Tilpassbar kundestatus: ledere definerer egne statuser med navn + farge
--  (f.eks. «Portefølje solgt», «Deaktivert», «Konkurs/tapsført», «Optimalisert»),
--  og statusen settes på hvert kundekort. Speiler event_types-mønsteret.
-- ============================================================================

create table if not exists public.customer_statuses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '#64748b',
  sort_order  int not null default 100,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table public.customer_statuses is
  'Leder-definerte kundestatuser (navn + farge) som settes på kundekort.';

-- Kobling fra kunde til status.
alter table public.customers
  add column if not exists status_id uuid
    references public.customer_statuses (id) on delete set null;

-- ---------------------------------------------------------------------------
--  RLS: alle innloggede leser; kun ledere kan opprette/endre/slette statuser.
-- ---------------------------------------------------------------------------
alter table public.customer_statuses enable row level security;

drop policy if exists customer_statuses_select on public.customer_statuses;
create policy customer_statuses_select on public.customer_statuses
  for select to authenticated
  using (true);

drop policy if exists customer_statuses_insert on public.customer_statuses;
create policy customer_statuses_insert on public.customer_statuses
  for insert to authenticated
  with check (public.is_manager());

drop policy if exists customer_statuses_update on public.customer_statuses;
create policy customer_statuses_update on public.customer_statuses
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists customer_statuses_delete on public.customer_statuses;
create policy customer_statuses_delete on public.customer_statuses
  for delete to authenticated
  using (public.is_manager());

-- ---------------------------------------------------------------------------
--  Frø noen standardstatuser (kan endres/slettes av ledere senere).
-- ---------------------------------------------------------------------------
insert into public.customer_statuses (name, color, sort_order)
values
  ('Portefølje solgt', '#22c55e', 10),
  ('Optimalisert',     '#8b5cf6', 20),
  ('Deaktivert',       '#64748b', 30),
  ('Konkurs/tapsført', '#ef4444', 40)
on conflict do nothing;
