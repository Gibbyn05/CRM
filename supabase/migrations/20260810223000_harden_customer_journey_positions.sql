drop policy if exists customer_journey_positions_insert_own
  on public.customer_journey_positions;
drop policy if exists customer_journey_positions_update_own
  on public.customer_journey_positions;

create policy customer_journey_positions_insert_own
  on public.customer_journey_positions
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      stage_id is null
      or exists (
        select 1
        from public.customer_journey_stages as stage
        where stage.id = stage_id
          and stage.user_id = (select auth.uid())
      )
    )
  );

create policy customer_journey_positions_update_own
  on public.customer_journey_positions
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      stage_id is null
      or exists (
        select 1
        from public.customer_journey_stages as stage
        where stage.id = stage_id
          and stage.user_id = (select auth.uid())
      )
    )
  );

create index if not exists customer_journey_positions_customer_idx
  on public.customer_journey_positions (customer_id);

create index if not exists customer_journey_positions_stage_only_idx
  on public.customer_journey_positions (stage_id);
