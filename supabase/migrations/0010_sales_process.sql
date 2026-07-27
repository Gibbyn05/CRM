-- ============================================================================
--  0010_sales_process.sql
--  Oppgave 2: Salgsprosess, automatisering og digital signering.
--
--  Nye funksjonsområder:
--   1. products            – produkt-/priskatalog (navn, pris, intervall, binding)
--   2. contract_templates  – redigerbare kontrakt-/e-postmaler med {{felt}}
--   3. deal_items          – produktlinjer på et tilbud (deals), med kontrollert
--                            prisoverstyring (>30% avvik krever salgssjef)
--   4. contracts           – utvidet med signeringslenke (token), rådgiver/
--                            org.nr-snapshot, gjengitt dokument/e-post, IP,
--                            avslag/utløp
--   5. contract_events     – revisjonslogg for hele signerings-hendelsesløpet
--                            (sendt/åpnet/signert/avslått/utløpt/resendt)
--
--  "Utløpt" lagres bevisst IKKE som ny verdi i contract_status-enumen (unngår
--  ALTER TYPE ... ADD VALUE-fallgruver i samme transaksjon som bruker verdien).
--  I stedet brukes contracts.expired_at – status beholder siste reelle verdi
--  (typisk 'sent'/'opened'), og UI viser "Utløpt" når expired_at er satt.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  ENUMS
-- ---------------------------------------------------------------------------
create type billing_interval as enum ('month', 'year', 'once');
create type template_type as enum ('contract', 'email');
create type signing_event_type as enum (
  'created', 'sent', 'opened', 'signed', 'declined', 'expired', 'resent'
);

-- ---------------------------------------------------------------------------
--  PRODUCTS  (produkt-/priskatalog)
-- ---------------------------------------------------------------------------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  price            numeric(12, 2) not null default 0,
  billing_interval billing_interval not null default 'month',
  -- Bindingstid i måneder. null = ingen binding.
  binding_months   integer,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint products_price_non_negative check (price >= 0),
  constraint products_binding_non_negative check (binding_months is null or binding_months >= 0)
);

comment on table public.products is 'Produkt-/priskatalog. Standardpris kan overstyres per tilbudslinje (deal_items).';

create index products_active_idx on public.products (is_active);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
--  CONTRACT_TEMPLATES  (kontrakt- og e-postmaler med dynamiske felt)
--  Støttede plassholdere (se src/lib/templates.ts): {{customer_name}},
--  {{org_number}}, {{advisor_name}}, {{advisor_email}}, {{date}},
--  {{valid_until}}, {{products_table}}, {{total_price}}, {{company_city}}.
-- ---------------------------------------------------------------------------
create table public.contract_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        template_type not null default 'contract',
  -- Kun relevant for type = 'email'.
  subject     text,
  body        text not null default '',
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.contract_templates is 'Redigerbare kontrakt-/e-postmaler med {{plassholder}}-felt, fylt ut ved utsendelse.';

create index contract_templates_type_idx on public.contract_templates (type, is_active);

create trigger contract_templates_set_updated_at
  before update on public.contract_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
--  DEAL_ITEMS  (produktlinjer på et tilbud/deal)
--  name/description/unit_price er en SNAPSHOT av produktet på tidspunktet
--  linjen legges til, slik at senere prisendringer i katalogen ikke endrer
--  historiske tilbud.
-- ---------------------------------------------------------------------------
create table public.deal_items (
  id               uuid primary key default gen_random_uuid(),
  deal_id          uuid not null references public.deals (id) on delete cascade,
  product_id       uuid references public.products (id) on delete set null,
  name             text not null,
  description      text,
  quantity         integer not null default 1,
  -- Standardpris (snapshot fra produktkatalogen).
  unit_price       numeric(12, 2) not null,
  -- Selgers overstyrte pris. null = bruk unit_price uendret.
  override_price   numeric(12, 2),
  billing_interval billing_interval not null default 'month',
  binding_months   integer,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint deal_items_quantity_positive check (quantity > 0),
  constraint deal_items_unit_price_non_negative check (unit_price >= 0),
  constraint deal_items_override_non_negative check (override_price is null or override_price >= 0)
);

comment on table public.deal_items is 'Produktlinjer på et tilbud, med snapshot av pris og kontrollert overstyring.';

create index deal_items_deal_idx on public.deal_items (deal_id);
create index deal_items_product_idx on public.deal_items (product_id);

-- Kontrollert prisoverstyring: mer enn 30% avvik fra standardpris krever
-- salgssjef. Håndheves i databasen (kan ikke omgås fra klienten).
create or replace function public.enforce_deal_item_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.override_price is not null
     and new.unit_price > 0
     and new.override_price < new.unit_price * 0.7
     and not public.is_manager() then
    raise exception 'Prisavvik over 30%% under standardpris krever godkjenning fra salgssjef.';
  end if;
  return new;
end;
$$;

create trigger deal_items_enforce_price
  before insert or update on public.deal_items
  for each row execute function public.enforce_deal_item_price();

-- ---------------------------------------------------------------------------
--  CONTRACTS  (utvidelse: signeringslenke, maler, snapshot, IP, avslag/utløp)
-- ---------------------------------------------------------------------------
alter table public.contracts
  add column contract_template_id uuid references public.contract_templates (id) on delete set null,
  add column email_template_id    uuid references public.contract_templates (id) on delete set null,
  -- Sikker, unik signeringslenke: lang tilfeldig token (se src/lib/tokens.ts).
  add column signing_token        text,
  add column token_expires_at     timestamptz,
  -- Gjengitt (og evt. manuelt redigert) innhold slik det faktisk ble sendt.
  add column subject              text,
  add column document_body        text,
  add column email_body           text,
  -- Snapshot av kontekst på sendetidspunkt (rådgiver/org.nr kan endre seg senere).
  add column org_number            char(9),
  add column advisor_name          text,
  add column total_amount          numeric(12, 2),
  -- Sporing av signeringsflyten. IP lagres kun der det er lovlig (se README).
  add column opened_ip             inet,
  add column signed_ip             inet,
  add column signed_by_name        text,
  add column signed_by_email       text,
  add column declined_at           timestamptz,
  add column declined_reason       text,
  add column expired_at            timestamptz,
  add column resend_count          integer not null default 0,
  add constraint contracts_org_number_9_digits
    check (org_number is null or org_number ~ '^[0-9]{9}$');

comment on column public.contracts.signing_token is 'Unik, tilfeldig bærer-token for /sign/[token]. Ikke gjenbrukbar på tvers av kontrakter.';
comment on column public.contracts.expired_at is 'Satt av /api/contracts/expire når token_expires_at er passert uten signering/avslag.';

create unique index contracts_signing_token_idx
  on public.contracts (signing_token)
  where signing_token is not null;

-- ---------------------------------------------------------------------------
--  CONTRACT_EVENTS  (revisjonslogg / hendelsesforløp for signeringsflyten)
-- ---------------------------------------------------------------------------
create table public.contract_events (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  event_type  signing_event_type not null,
  occurred_at timestamptz not null default now(),
  -- Hvem utløste hendelsen: 'agent' (selger/UI), 'customer' (signerings-
  -- lenken), eller 'system' (f.eks. utløpsjobb).
  actor       text not null default 'system',
  ip          inet,
  user_agent  text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.contract_events is 'Kronologisk revisjonslogg for kontrakt-/signeringsflyten, vist på kundekortet.';

create index contract_events_contract_idx on public.contract_events (contract_id, occurred_at);

-- ---------------------------------------------------------------------------
--  DEALS  (mindre tillegg: gyldig-til-dato for tilbud, brukt i maler)
-- ---------------------------------------------------------------------------
alter table public.deals add column valid_until date;

-- ---------------------------------------------------------------------------
--  CUSTOMERS  (daglig leder fra org.nr-oppslag, se src/lib/company-lookup)
-- ---------------------------------------------------------------------------
alter table public.customers add column ceo_name text;
comment on column public.customers.ceo_name is 'Daglig leder hentet fra Brønnøysundregisterets rolleoversikt.';

-- ---------------------------------------------------------------------------
--  RLS
-- ---------------------------------------------------------------------------
alter table public.products           enable row level security;
alter table public.contract_templates enable row level security;
alter table public.deal_items         enable row level security;
alter table public.contract_events    enable row level security;

-- PRODUCTS: alle innloggede leser (trengs for å bygge tilbud); kun salgssjef
-- oppretter/endrer/sletter katalogen.
create policy products_select on public.products
  for select to authenticated
  using (true);
create policy products_insert on public.products
  for insert to authenticated
  with check (public.is_manager());
create policy products_update on public.products
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());
create policy products_delete on public.products
  for delete to authenticated
  using (public.is_manager());

-- CONTRACT_TEMPLATES: samme mønster som products.
create policy contract_templates_select on public.contract_templates
  for select to authenticated
  using (true);
create policy contract_templates_insert on public.contract_templates
  for insert to authenticated
  with check (public.is_manager());
create policy contract_templates_update on public.contract_templates
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());
create policy contract_templates_delete on public.contract_templates
  for delete to authenticated
  using (public.is_manager());

-- DEAL_ITEMS: følger kunde-tilgangen til dealen (samme mønster som notes/deals).
create policy deal_items_select on public.deal_items
  for select to authenticated
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.can_access_customer(d.customer_id)
    )
  );
create policy deal_items_insert on public.deal_items
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.deals d
      where d.id = deal_id and public.can_access_customer(d.customer_id)
    )
  );
create policy deal_items_update on public.deal_items
  for update to authenticated
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.can_access_customer(d.customer_id)
    )
  )
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.can_access_customer(d.customer_id)
    )
  );
create policy deal_items_delete on public.deal_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and public.can_access_customer(d.customer_id)
    )
  );

-- CONTRACT_EVENTS: leses av alle med tilgang til kunden. Innsettes av
-- innlogget selger for agent-initierte hendelser (opprettet/sendt/resendt);
-- kunde-initierte hendelser (åpnet/signert/avslått) og utløp settes av
-- service-role (bypasser RLS) fra /api/sign og /api/contracts/expire.
create policy contract_events_select on public.contract_events
  for select to authenticated
  using (
    exists (
      select 1 from public.contracts c
      where c.id = contract_id and public.can_access_customer(c.customer_id)
    )
  );
create policy contract_events_insert on public.contract_events
  for insert to authenticated
  with check (
    exists (
      select 1 from public.contracts c
      where c.id = contract_id and public.can_access_customer(c.customer_id)
    )
  );

-- ---------------------------------------------------------------------------
--  Varsling: utvid kontrakt-varsling til også å dekke avslått + utløpt.
--  (Redefinerer funksjonen fra 0009_reminders_notifications_transcripts.sql.)
-- ---------------------------------------------------------------------------
create or replace function public.notify_contract_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.agent_id is null then
    return new;
  end if;

  if new.status is distinct from old.status and new.status in ('opened', 'signed', 'declined') then
    select name into v_name from public.customers where id = new.customer_id;
    perform public.create_notification(
      new.agent_id, 'contract',
      case new.status
        when 'signed'   then 'Kontrakt signert'
        when 'declined' then 'Tilbud avslått'
        else 'Kontrakt åpnet'
      end,
      coalesce(v_name, 'Kunde'),
      '/customers/' || new.customer_id::text);
  elsif new.expired_at is not null and old.expired_at is null then
    select name into v_name from public.customers where id = new.customer_id;
    perform public.create_notification(
      new.agent_id, 'contract', 'Signeringslenke utløpt',
      coalesce(v_name, 'Kunde'),
      '/customers/' || new.customer_id::text);
  end if;
  return new;
end; $$;

-- ---------------------------------------------------------------------------
--  contracts_set_updated_at-triggeren (fra 0002) dekker allerede update.
-- ---------------------------------------------------------------------------
