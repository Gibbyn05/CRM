-- ============================================================================
--  0017_fiken_commissions.sql
--  Grunnmur for regnskap/provisjon mot Fiken.
--   - commissions: én provisjonsrad per vunnet salg (deal), med status som
--     følger salget fra «ikke fakturert» → «fakturert» → «betalt».
--   - organization.commission_rate: standard provisjonssats (15 %).
--   - customers.fiken_contact_id: kobling CRM-kunde ↔ Fiken-kontakt.
--
--  Selve Fiken-integrasjonen (henting av fakturaer/betalt-status) skjer
--  server-side i src/lib/fiken.ts. Denne migrasjonen lager kun datamodellen.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  Standard provisjonssats på organisasjonen (redigerbar av ledere senere).
--  numeric(6,4): 0.1500 = 15 %.
-- ---------------------------------------------------------------------------
alter table public.organization
  add column if not exists commission_rate numeric(6, 4) not null default 0.15;

comment on column public.organization.commission_rate is
  'Standard provisjonssats (andel av salgsbeløp). 0.15 = 15 %.';

-- ---------------------------------------------------------------------------
--  Kobling CRM-kunde ↔ Fiken-kontakt (contactId fra Fiken).
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists fiken_contact_id bigint;

comment on column public.customers.fiken_contact_id is
  'Fiken contactId for denne kunden (settes når faktura opprettes/matches).';

-- ---------------------------------------------------------------------------
--  commissions – provisjon per vunnet salg.
--  Én rad per deal (unik deal_id) slik at gjenåpning/omsetting ikke dupliserer.
-- ---------------------------------------------------------------------------
create table public.commissions (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null unique
                      references public.deals (id) on delete cascade,
  agent_id          uuid references public.profiles (id) on delete set null,
  customer_id       uuid references public.customers (id) on delete set null,

  sale_amount       numeric(12, 2) not null default 0,
  commission_rate   numeric(6, 4)  not null default 0.15,
  commission_amount numeric(12, 2) not null default 0,

  -- Livsløp for salget/provisjonen:
  --   ikke_fakturert – vunnet i CRM, ingen faktura ennå
  --   fakturert      – faktura finnes i Fiken, ubetalt
  --   betalt         – faktura oppgjort (settled) i Fiken
  --   forfalt        – ubetalt og forfallsdato passert (utsatt)
  --   avskrevet      – tapsført
  status            text not null default 'ikke_fakturert'
                      check (status in
                        ('ikke_fakturert', 'fakturert', 'betalt', 'forfalt', 'avskrevet')),

  fiken_invoice_id  bigint,
  fiken_contact_id  bigint,
  invoiced_at       timestamptz,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.commissions is
  'Provisjon per vunnet salg (deal). Status følger salget mot Fiken; selgere ser egne, ledere ser alle.';

create index commissions_agent_idx  on public.commissions (agent_id);
create index commissions_status_idx on public.commissions (status);

create trigger commissions_set_updated_at
  before update on public.commissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
--  RLS
--   Lese : ledere ser alt, selgere ser kun egne rader.
--   Skriv: kun ledere (server bruker service-role og omgår RLS uansett).
-- ---------------------------------------------------------------------------
alter table public.commissions enable row level security;

create policy commissions_select on public.commissions
  for select to authenticated
  using (public.is_manager() or agent_id = auth.uid());

create policy commissions_insert on public.commissions
  for insert to authenticated
  with check (public.is_manager());

create policy commissions_update on public.commissions
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy commissions_delete on public.commissions
  for delete to authenticated
  using (public.is_manager());
