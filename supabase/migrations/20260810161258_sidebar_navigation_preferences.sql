alter table public.dashboard_preferences
  add column navigation jsonb not null default '[]'::jsonb,
  add constraint dashboard_preferences_navigation_array
    check (jsonb_typeof(navigation) = 'array');

comment on column public.dashboard_preferences.navigation is
  'Personlig rekkefølge og synlighet for sidebar-kategorier og menypunkter.';
