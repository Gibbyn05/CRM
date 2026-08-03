-- ============================================================================
--  0021_leadership_discussion.sql
--  Ny meldingskanal 'leadership' (Diskusjon-fanen under Salg) forbeholdt
--  ledere. Gjenbruker messages-tabellen på samme måte som 'team'/'direct'.
--
--  Denne migrasjonen kjører etter 0019_customer_discussion_manager_only.sql,
--  som allerede har gjort 'customer'-kanalen leder-only. Policyene under
--  bygger videre på DEN tilstanden (customer -> is_manager(), ikke lenger
--  can_access_customer) i stedet for å tilbakestille den – begge migrasjonene
--  gjør drop+create på samme policy, så rekkefølgen (0019 før 0021) betyr noe.
--
--  MERK: `alter type ... add value` kan ikke kjøre inne i samme transaksjon som
--  bruker den nye verdien. I Supabase SQL Editor kjører hver setning med
--  autocommit, så hele fila kan limes inn. Får du en feil om "unsafe use of new
--  value", kjør den første setningen alene først, deretter resten.
-- ============================================================================

alter type message_channel add value if not exists 'leadership';

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    channel = 'team'
    or (channel = 'customer' and public.is_manager())
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
      or (channel = 'customer' and public.is_manager())
      or (channel = 'direct' and recipient_id is not null and recipient_id <> auth.uid())
      or (channel = 'leadership' and public.is_manager())
    )
  );
