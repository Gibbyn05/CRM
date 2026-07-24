-- ============================================================================
--  0007_direct_messages.sql
--  Direktemeldinger (1:1) mellom ansatte, i tillegg til team- og kunde-chat.
--  Gjenbruker messages-tabellen med en ny kanal 'direct' + recipient_id.
--
--  MERK: `alter type ... add value` kan ikke kjøre inne i samme transaksjon som
--  bruker den nye verdien. I Supabase SQL Editor kjører hver setning med
--  autocommit, så hele fila kan limes inn. Får du en feil om "unsafe use of new
--  value", kjør den første setningen alene først, deretter resten.
-- ============================================================================

alter type message_channel add value if not exists 'direct';

alter table public.messages
  add column if not exists recipient_id uuid references public.profiles (id) on delete cascade;

create index if not exists messages_direct_idx
  on public.messages (channel, author_id, recipient_id, created_at);

-- Utvid RLS til å dekke direktemeldinger: kun avsender og mottaker ser dem.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    channel = 'team'
    or (channel = 'customer' and public.can_access_customer(customer_id))
    or (channel = 'direct' and (author_id = auth.uid() or recipient_id = auth.uid()))
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
    )
  );
