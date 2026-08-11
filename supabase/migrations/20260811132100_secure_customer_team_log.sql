alter table public.messages
  drop constraint if exists customer_channel_requires_customer;

alter table public.messages
  add constraint customer_channel_requires_customer
  check (
    channel not in ('customer', 'customer_team')
    or customer_id is not null
  );

create policy messages_customer_team_select on public.messages
  for select to authenticated
  using (
    channel = 'customer_team'
    and (select public.can_access_customer(customer_id))
  );

create policy messages_customer_team_insert on public.messages
  for insert to authenticated
  with check (
    channel = 'customer_team'
    and author_id = (select auth.uid())
    and (select public.can_access_customer(customer_id))
  );
