-- Organisasjonsstyrte kontraktsmaler og sporbar AI-generering.

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id smallint not null default 1 references public.organization(id) on delete cascade,
  name text not null,
  description text,
  template_text text not null default '',
  source_file_name text,
  source_file_path text,
  source_mime_type text,
  is_active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_templates_name_not_blank check (length(trim(name)) > 0)
);

create table if not exists public.contract_template_products (
  template_id uuid not null references public.contract_templates(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (template_id, product_id)
);

create index if not exists contract_templates_active_idx
  on public.contract_templates (organization_id, is_active, updated_at desc);
create index if not exists contract_template_products_product_idx
  on public.contract_template_products (product_id, template_id);

create trigger contract_templates_set_updated_at
  before update on public.contract_templates
  for each row execute function public.set_updated_at();

alter table public.contract_templates enable row level security;
alter table public.contract_template_products enable row level security;

create policy contract_templates_select on public.contract_templates
  for select to authenticated using (true);
create policy contract_templates_insert on public.contract_templates
  for insert to authenticated with check (public.is_manager());
create policy contract_templates_update on public.contract_templates
  for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy contract_templates_delete on public.contract_templates
  for delete to authenticated using (public.is_manager());

create policy contract_template_products_select on public.contract_template_products
  for select to authenticated using (true);
create policy contract_template_products_insert on public.contract_template_products
  for insert to authenticated with check (public.is_manager());
create policy contract_template_products_delete on public.contract_template_products
  for delete to authenticated using (public.is_manager());

grant select, insert, update, delete on public.contract_templates to authenticated;
grant select, insert, delete on public.contract_template_products to authenticated;

insert into storage.buckets (id, name, public)
values ('contract-templates', 'contract-templates', false)
on conflict (id) do update set public = false;

create policy "contract_templates_files_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'contract-templates' and public.is_manager());
create policy "contract_templates_files_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contract-templates' and public.is_manager());
create policy "contract_templates_files_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'contract-templates' and public.is_manager())
  with check (bucket_id = 'contract-templates' and public.is_manager());
create policy "contract_templates_files_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'contract-templates' and public.is_manager());

alter table public.deals
  add column if not exists contract_template_id uuid references public.contract_templates(id) on delete set null,
  add column if not exists contract_generation_data jsonb not null default '{}'::jsonb;

alter table public.contracts
  add column if not exists contract_template_id uuid references public.contract_templates(id) on delete set null,
  add column if not exists generation_data jsonb not null default '{}'::jsonb,
  add column if not exists approved_at timestamptz;

comment on table public.contract_templates is
  'Versjonerte kontraktsmaler administrert av organisasjonens ledere.';
comment on column public.deals.contract_generation_data is
  'Sporbart snapshot av CRM-data og manuelle felt brukt til kontrakten.';
