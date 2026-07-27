-- ============================================================================
--  0011_event_types_calendar.sql
--  Kalendermodul: egendefinerte hendelsestyper med farge + team-kalender.
--   1. event_types      – navn + farge, delt på tvers av teamet
--   2. appointments.event_type_id – kobling til valgt type
--   3. Åpne lese-policy på appointments slik at hele teamet ser alle
--      hendelser (klientside «mine/alle»-filter). Skriving forblir egne/leder.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  EVENT_TYPES
-- ---------------------------------------------------------------------------
create table public.event_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '#6366f1',   -- hex-farge
  sort_order  integer not null default 0,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint event_types_color_hex check (color ~* '^#[0-9a-f]{6}$')
);

comment on table public.event_types is
  'Egendefinerte hendelsestyper med farge, brukt i kalenderen.';

-- Standardtyper (created_by = null => «system», kun ledere kan endre disse).
insert into public.event_types (name, color, sort_order) values
  ('Møte',        '#6366f1', 1),
  ('Oppfølging',  '#f59e0b', 2),
  ('Signering',   '#22c55e', 3),
  ('Demo',        '#3b82f6', 4),
  ('Telefon',     '#14b8a6', 5),
  ('Annet',       '#94a3b8', 6);

alter table public.event_types enable row level security;

-- Alle innloggede kan lese typene.
create policy event_types_select on public.event_types
  for select to authenticated
  using (true);

-- Alle kan opprette egne typer (settes med created_by = seg selv).
create policy event_types_insert on public.event_types
  for insert to authenticated
  with check (created_by = auth.uid() or public.is_manager());

-- Endre/slette: egne typer, eller leder (også system-typer).
create policy event_types_update on public.event_types
  for update to authenticated
  using (public.is_manager() or created_by = auth.uid())
  with check (public.is_manager() or created_by = auth.uid());

create policy event_types_delete on public.event_types
  for delete to authenticated
  using (public.is_manager() or created_by = auth.uid());

-- ---------------------------------------------------------------------------
--  APPOINTMENTS: koble til hendelsestype
-- ---------------------------------------------------------------------------
alter table public.appointments
  add column if not exists event_type_id uuid
    references public.event_types (id) on delete set null;

create index if not exists appointments_event_type_idx
  on public.appointments (event_type_id);

-- ---------------------------------------------------------------------------
--  Team-kalender: alle innloggede kan lese alle hendelser.
--  (Skriving/oppdatering/sletting forblir egne-eller-leder.)
-- ---------------------------------------------------------------------------
drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
--  Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.event_types;
