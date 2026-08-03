-- ============================================================================
--  0022_products_reconcile_columns.sql
--  En annen modul opprettet products-tabellen med en litt annen struktur
--  (billing_interval/binding_months). 0021 sitt «create table if not exists»
--  hoppet derfor over kolonnene salgsveiviseren trenger. Denne migrasjonen
--  legger dem til additivt – uten å røre de eksisterende feltene.
-- ============================================================================

alter table public.products
  add column if not exists unit_label text not null default 'per stk',
  add column if not exists tier       text not null default 'Standard',
  add column if not exists billing_type text not null default 'engang',
  add column if not exists image_url  text,
  add column if not exists sort_order int not null default 100;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_billing_type_check'
  ) then
    alter table public.products
      add constraint products_billing_type_check
      check (billing_type in ('engang', 'lopende'));
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;
