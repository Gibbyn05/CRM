-- ============================================================================
--  0021_products_and_deal_items.sql
--  Produkt-/tjenestekatalog + linjeprodukter på et tilbud/salg (deal).
--   - products: katalog ledere vedlikeholder (navn, pris, beskrivelse, bilde …)
--   - deal_items: linjene i et konkret tilbud (antall, pris, avtaleperiode)
--   - storage-bucket «products» for produktbilder
--
--  Salgsveiviseren (kommer i neste steg) fyller deal_items, og deal.amount
--  settes til summen – som igjen driver provisjon/Fiken.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  products – katalog
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  price         numeric(12, 2) not null default 0,
  currency      text not null default 'NOK',
  unit_label    text not null default 'per stk',
  tier          text not null default 'Standard',
  -- Fakturering: engang = «faktureres én gang etter signering», lopende = abonnement.
  billing_type  text not null default 'engang'
                  check (billing_type in ('engang', 'lopende')),
  image_url     text,
  is_active     boolean not null default true,
  sort_order    int not null default 100,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.products is
  'Produkt-/tjenestekatalog som brukes i salgsveiviseren.';

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated using (true);

drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert to authenticated with check (public.is_manager());

drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete to authenticated using (public.is_manager());

-- ---------------------------------------------------------------------------
--  deal_items – linjeprodukter på et tilbud/salg
-- ---------------------------------------------------------------------------
create table if not exists public.deal_items (
  id              uuid primary key default gen_random_uuid(),
  deal_id         uuid not null references public.deals (id) on delete cascade,
  product_id      uuid references public.products (id) on delete set null,
  -- Snapshot av navn/beskrivelse/pris slik tilbudet så ut da det ble laget.
  name            text not null,
  description     text,
  unit_price      numeric(12, 2) not null default 0,
  quantity        int not null default 1,
  billing_type    text not null default 'engang',
  agreement_start date,
  agreement_end   date,
  line_total      numeric(12, 2) not null default 0,
  created_at      timestamptz not null default now()
);

comment on table public.deal_items is
  'Linjeprodukter på et tilbud/salg (deal). Sum = deal.amount.';

create index if not exists deal_items_deal_idx on public.deal_items (deal_id);

alter table public.deal_items enable row level security;

-- Tilgang følger tilbudets kunde (samme regler som resten av kundedata).
drop policy if exists deal_items_select on public.deal_items;
create policy deal_items_select on public.deal_items
  for select to authenticated
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.can_access_customer(d.customer_id)
    )
  );

drop policy if exists deal_items_insert on public.deal_items;
create policy deal_items_insert on public.deal_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.can_access_customer(d.customer_id)
    )
  );

drop policy if exists deal_items_update on public.deal_items;
create policy deal_items_update on public.deal_items
  for update to authenticated
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.can_access_customer(d.customer_id)
    )
  );

drop policy if exists deal_items_delete on public.deal_items;
create policy deal_items_delete on public.deal_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.can_access_customer(d.customer_id)
    )
  );

-- ---------------------------------------------------------------------------
--  Storage: produktbilder (offentlig lesbar bucket)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

drop policy if exists "products_read" on storage.objects;
create policy "products_read" on storage.objects
  for select using (bucket_id = 'products');

drop policy if exists "products_write" on storage.objects;
create policy "products_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'products' and public.is_manager());

drop policy if exists "products_update" on storage.objects;
create policy "products_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'products' and public.is_manager());

drop policy if exists "products_delete" on storage.objects;
create policy "products_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'products' and public.is_manager());
