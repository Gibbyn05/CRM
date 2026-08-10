create table public.customer_journey_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  color text not null default '#64748b',
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customer_journey_stages_user_name_idx
  on public.customer_journey_stages (user_id, lower(name));
create index customer_journey_stages_user_order_idx
  on public.customer_journey_stages (user_id, sort_order);

create table public.customer_journey_positions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  stage_id uuid references public.customer_journey_stages (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, customer_id)
);

create index customer_journey_positions_stage_idx
  on public.customer_journey_positions (user_id, stage_id);

alter table public.customer_journey_stages enable row level security;
alter table public.customer_journey_positions enable row level security;

create policy customer_journey_stages_select_own on public.customer_journey_stages
  for select to authenticated using (user_id = (select auth.uid()));
create policy customer_journey_stages_insert_own on public.customer_journey_stages
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy customer_journey_stages_update_own on public.customer_journey_stages
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy customer_journey_stages_delete_own on public.customer_journey_stages
  for delete to authenticated using (user_id = (select auth.uid()));

create policy customer_journey_positions_select_own on public.customer_journey_positions
  for select to authenticated using (user_id = (select auth.uid()));
create policy customer_journey_positions_insert_own on public.customer_journey_positions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy customer_journey_positions_update_own on public.customer_journey_positions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy customer_journey_positions_delete_own on public.customer_journey_positions
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.customer_journey_stages to authenticated;
grant select, insert, update, delete on public.customer_journey_positions to authenticated;
