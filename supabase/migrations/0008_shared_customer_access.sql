-- ============================================================================
--  0008_shared_customer_access.sql
--  Delt kundetilgang: ALLE innloggede (selgere som ledere) skal se og jobbe med
--  ALLE kunder – på kundesiden, i pipeline, kalender, osv. Den eneste
--  handlingen som er forbeholdt ledere er SLETTING av kunder.
--
--  Endrer tidligere eier-basert synlighet (owner_id = auth.uid() or null) til
--  åpen lesetilgang for hele teamet. Sletting styres fortsatt av
--  customers_delete (kun ledere, satt i 0006).
-- ============================================================================

-- 1) Kunder: alle innloggede kan se og oppdatere. Innsett som før. Slett = leder.
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated
  using (true);

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated
  using (true)
  with check (true);

-- (customers_delete forblir kun ledere – definert i 0006.)
drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers
  for delete to authenticated
  using (public.is_manager());

-- 2) Kunde-avhengige data (notater, deals/pipeline, kontrakter, kunde-chat)
--    følger can_access_customer(). Åpne den for hele teamet slik at pipeline
--    og kundekort viser alt for alle innloggede.
create or replace function public.can_access_customer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;
