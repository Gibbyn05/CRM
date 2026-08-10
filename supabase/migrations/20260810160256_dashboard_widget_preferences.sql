create table public.dashboard_preferences (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  widgets    jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint dashboard_preferences_widgets_array
    check (jsonb_typeof(widgets) = 'array')
);

comment on table public.dashboard_preferences is
  'Personlig rekkefølge, synlighet og farge for dashboard-widgets.';

create trigger dashboard_preferences_set_updated_at
  before update on public.dashboard_preferences
  for each row execute function public.set_updated_at();

alter table public.dashboard_preferences enable row level security;

create policy dashboard_preferences_select_own_manager
  on public.dashboard_preferences for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.is_manager())
  );

create policy dashboard_preferences_insert_own_manager
  on public.dashboard_preferences for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select public.is_manager())
  );

create policy dashboard_preferences_update_own_manager
  on public.dashboard_preferences for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.is_manager())
  )
  with check (
    (select auth.uid()) = user_id
    and (select public.is_manager())
  );

grant select, insert, update on table public.dashboard_preferences to authenticated;
