drop policy if exists dashboard_preferences_select_own_manager
  on public.dashboard_preferences;
drop policy if exists dashboard_preferences_insert_own_manager
  on public.dashboard_preferences;
drop policy if exists dashboard_preferences_update_own_manager
  on public.dashboard_preferences;

create policy dashboard_preferences_select_own
  on public.dashboard_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy dashboard_preferences_insert_own
  on public.dashboard_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy dashboard_preferences_update_own
  on public.dashboard_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
