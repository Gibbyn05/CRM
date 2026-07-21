-- ============================================================================
--  0003_rls_policies.sql
--  Row Level Security. Rollebasert tilgang:
--   - Salgssjef (manager): ser hele teamet — live-dashboard, ledertavler,
--     alle kunder/deals/avtaler.
--   - Selger (agent): ser primært sine egne kunder/kalender/logg, men ser
--     hele live-statustavlen (ingen skal kunne "gjemme seg").
--
--  TV-visningen bruker en egen server-route med service-role og trenger ikke
--  anon-tilgang her.
-- ============================================================================

alter table public.profiles       enable row level security;
alter table public.agent_states   enable row level security;
alter table public.customers      enable row level security;
alter table public.call_logs      enable row level security;
alter table public.notes          enable row level security;
alter table public.deals          enable row level security;
alter table public.appointments   enable row level security;
alter table public.contracts      enable row level security;
alter table public.messages       enable row level security;
alter table public.daily_reports  enable row level security;

-- ---------------------------------------------------------------------------
--  PROFILES
--  Alle innloggede kan lese profiler (nødvendig for navn på tavla/chat).
--  Man kan oppdatere sin egen profil; ledere kan oppdatere alle.
-- ---------------------------------------------------------------------------
create policy profiles_select_all on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_manager())
  with check (id = auth.uid() or public.is_manager());

-- ---------------------------------------------------------------------------
--  AGENT_STATES
--  Alle innloggede kan LESE hele tavla (ingen gjemmer seg). Kun eier eller
--  systemet (service-role) skriver — skriving skjer normalt via RPC/webhook.
-- ---------------------------------------------------------------------------
create policy agent_states_select_all on public.agent_states
  for select to authenticated
  using (true);

create policy agent_states_update_own on public.agent_states
  for update to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

-- ---------------------------------------------------------------------------
--  CUSTOMERS
--  Selger: egne kunder + ikke-tildelte. Salgssjef: alle.
--  Innsett: enhver innlogget (blir eier/created_by). Oppdater/slett: eier
--  eller leder.
-- ---------------------------------------------------------------------------
create policy customers_select on public.customers
  for select to authenticated
  using (public.is_manager() or owner_id = auth.uid() or owner_id is null);

create policy customers_insert on public.customers
  for insert to authenticated
  with check (created_by = auth.uid() or public.is_manager());

create policy customers_update on public.customers
  for update to authenticated
  using (public.is_manager() or owner_id = auth.uid())
  with check (public.is_manager() or owner_id = auth.uid());

create policy customers_delete on public.customers
  for delete to authenticated
  using (public.is_manager() or owner_id = auth.uid());

-- Hjelpefunksjon: har innlogget bruker tilgang til en kunde?
create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_manager() or exists (
    select 1 from public.customers c
    where c.id = p_customer_id
      and (c.owner_id = auth.uid() or c.owner_id is null)
  );
$$;

-- ---------------------------------------------------------------------------
--  CALL_LOGS
--  Selger ser egne samtaler; leder ser alle. Skriving skjer via webhook
--  (service-role bypasser RLS), men vi tillater agenten å lese sine.
-- ---------------------------------------------------------------------------
create policy call_logs_select on public.call_logs
  for select to authenticated
  using (public.is_manager() or agent_id = auth.uid());

-- ---------------------------------------------------------------------------
--  NOTES  (følger kunde-tilgang)
-- ---------------------------------------------------------------------------
create policy notes_select on public.notes
  for select to authenticated
  using (public.can_access_customer(customer_id));

create policy notes_insert on public.notes
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_customer(customer_id));

create policy notes_delete on public.notes
  for delete to authenticated
  using (public.is_manager() or author_id = auth.uid());

-- ---------------------------------------------------------------------------
--  DEALS  (følger kunde-tilgang)
-- ---------------------------------------------------------------------------
create policy deals_select on public.deals
  for select to authenticated
  using (public.can_access_customer(customer_id));

create policy deals_insert on public.deals
  for insert to authenticated
  with check (public.can_access_customer(customer_id));

create policy deals_update on public.deals
  for update to authenticated
  using (public.can_access_customer(customer_id))
  with check (public.can_access_customer(customer_id));

create policy deals_delete on public.deals
  for delete to authenticated
  using (public.is_manager() or agent_id = auth.uid());

-- ---------------------------------------------------------------------------
--  APPOINTMENTS
--  Selger ser/endrer egne; leder ser alle.
-- ---------------------------------------------------------------------------
create policy appointments_select on public.appointments
  for select to authenticated
  using (public.is_manager() or agent_id = auth.uid());

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check (agent_id = auth.uid() or public.is_manager());

create policy appointments_update on public.appointments
  for update to authenticated
  using (public.is_manager() or agent_id = auth.uid())
  with check (public.is_manager() or agent_id = auth.uid());

create policy appointments_delete on public.appointments
  for delete to authenticated
  using (public.is_manager() or agent_id = auth.uid());

-- ---------------------------------------------------------------------------
--  CONTRACTS  (følger kunde-tilgang)
-- ---------------------------------------------------------------------------
create policy contracts_select on public.contracts
  for select to authenticated
  using (public.can_access_customer(customer_id));

create policy contracts_insert on public.contracts
  for insert to authenticated
  with check (public.can_access_customer(customer_id));

create policy contracts_update on public.contracts
  for update to authenticated
  using (public.can_access_customer(customer_id))
  with check (public.can_access_customer(customer_id));

-- ---------------------------------------------------------------------------
--  MESSAGES
--  Team-kanal: alle innloggede leser/skriver. Kunde-kanal: kun de med tilgang
--  til kunden.
-- ---------------------------------------------------------------------------
create policy messages_select on public.messages
  for select to authenticated
  using (
    channel = 'team'
    or (channel = 'customer' and public.can_access_customer(customer_id))
  );

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      channel = 'team'
      or (channel = 'customer' and public.can_access_customer(customer_id))
    )
  );

create policy messages_delete on public.messages
  for delete to authenticated
  using (public.is_manager() or author_id = auth.uid());

-- ---------------------------------------------------------------------------
--  DAILY_REPORTS
--  Selger ser egne dagsaviser; leder ser alle. Generering skjer server-side
--  (service-role) via /api/dagsavis.
-- ---------------------------------------------------------------------------
create policy daily_reports_select on public.daily_reports
  for select to authenticated
  using (public.is_manager() or agent_id = auth.uid());
