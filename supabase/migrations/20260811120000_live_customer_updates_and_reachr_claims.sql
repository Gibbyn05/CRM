create table if not exists public.reachr_lead_claims (
  org_number char(9) primary key check (org_number ~ '^[0-9]{9}$'),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.reachr_lead_claims enable row level security;

create policy "Authenticated users can see lead claims"
  on public.reachr_lead_claims for select to authenticated using (true);
create policy "Users can claim leads for themselves"
  on public.reachr_lead_claims for insert to authenticated
  with check (owner_id = auth.uid());
create policy "Owners and managers can release lead claims"
  on public.reachr_lead_claims for delete to authenticated
  using (owner_id = auth.uid() or public.is_manager());

grant select, insert, delete on public.reachr_lead_claims to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customers') then
    alter publication supabase_realtime add table public.customers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customer_files') then
    alter publication supabase_realtime add table public.customer_files;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reachr_lead_claims') then
    alter publication supabase_realtime add table public.reachr_lead_claims;
  end if;
end $$;
