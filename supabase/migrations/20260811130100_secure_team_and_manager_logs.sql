-- De eksisterende policyene for teamchat, kundediskusjon og direktemeldinger
-- beholdes urørt. Disse tilleggspolicyene gjelder bare lederkanalen.
create policy messages_manager_select on public.messages
  for select to authenticated
  using (channel = 'manager' and (select public.is_manager()));

create policy messages_manager_insert on public.messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and channel = 'manager'
    and (select public.is_manager())
  );
