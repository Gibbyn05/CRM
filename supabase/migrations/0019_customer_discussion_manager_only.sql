-- ============================================================================
--  0019_customer_discussion_manager_only.sql
--  «Diskusjon» på kundekortet (messages.channel = 'customer') skal kun være
--  for ledere – selgere skal verken se eller kunne skrive der.
--
--  Team-chat og direktemeldinger er uendret.
-- ============================================================================

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    channel = 'team'
    or (channel = 'customer' and public.is_manager())
    or (channel = 'direct' and (author_id = auth.uid() or recipient_id = auth.uid()))
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
    )
  );
