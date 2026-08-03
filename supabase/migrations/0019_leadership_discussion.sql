-- ============================================================================
--  0019_leadership_discussion.sql
--  Ny meldingskanal 'leadership' (Diskusjon-fanen under Salg) forbeholdt
--  ledere. Gjenbruker messages-tabellen på samme måte som 'team'/'direct'.
--
--  MERK: `alter type ... add value` kan ikke kjøre inne i samme transaksjon som
--  bruker den nye verdien. I Supabase SQL Editor kjører hver setning med
--  autocommit, så hele fila kan limes inn. Får du en feil om "unsafe use of new
--  value", kjør den første setningen alene først, deretter resten.
-- ============================================================================

alter type message_channel add value if not exists 'leadership';

-- Kun ledere kan lese/skrive i leadership-kanalen; de andre kanalene er
-- uendret fra tidligere migrasjoner.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    channel = 'team'
    or (channel = 'customer' and public.can_access_customer(customer_id))
    or (channel = 'direct' and (author_id = auth.uid() or recipient_id = auth.uid()))
    or (channel = 'leadership' and public.is_manager())
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      channel = 'team'
      or (channel = 'customer' and public.can_access_customer(customer_id))
      or (channel = 'direct' and recipient_id is not null and recipient_id <> auth.uid())
      or (channel = 'leadership' and public.is_manager())
    )
  );
