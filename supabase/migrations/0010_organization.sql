-- ============================================================================
--  0010_organization.sql
--  «Min organisasjon» – én rad med selskapsinformasjon som gjenbrukes i maler
--  (kontrakt-/tilbuds-e-post m.m.). Kun ledere kan endre; alle innloggede leser.
--  Egen storage-bucket «branding» for logo.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  TABELL  (singleton – alltid nøyaktig én rad, id = 1)
-- ---------------------------------------------------------------------------
create table public.organization (
  id               smallint primary key default 1 check (id = 1),
  name             text not null default '',
  org_number       char(9),
  email            text,
  phone            text,
  website          text,
  address          text,
  postal_code      text,
  city             text,
  logo_url         text,
  -- Gjenbrukbar tekst i maler:
  email_signature  text,   -- standard signatur i utgående e-post
  contract_footer  text,   -- bunntekst nederst i kontrakt-/tilbuds-e-post
  updated_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint org_number_9_digits
    check (org_number is null or org_number ~ '^[0-9]{9}$')
);

comment on table public.organization is
  'Singleton med selskapsinfo/branding som gjenbrukes i maler. Kun én rad (id=1).';

-- Frø den ene raden slik at appen alltid finner den.
insert into public.organization (id) values (1) on conflict (id) do nothing;

create trigger organization_set_updated_at
  before update on public.organization
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
--  RLS
-- ---------------------------------------------------------------------------
alter table public.organization enable row level security;

-- Alle innloggede kan lese selskapsinfoen (brukes i maler/topbar).
create policy organization_select on public.organization
  for select to authenticated
  using (true);

-- Kun ledere kan opprette/endre.
create policy organization_insert on public.organization
  for insert to authenticated
  with check (public.is_manager());
create policy organization_update on public.organization
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- ---------------------------------------------------------------------------
--  STORAGE  (logo)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Les: alle (offentlig bucket, logo vises i e-post/topbar).
drop policy if exists "branding_read" on storage.objects;
create policy "branding_read" on storage.objects
  for select
  using (bucket_id = 'branding');

-- Skriv/erstatt/slett: kun ledere.
drop policy if exists "branding_insert" on storage.objects;
create policy "branding_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and public.is_manager());

drop policy if exists "branding_update" on storage.objects;
create policy "branding_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and public.is_manager());

drop policy if exists "branding_delete" on storage.objects;
create policy "branding_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and public.is_manager());
