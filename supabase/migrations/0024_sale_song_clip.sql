-- ============================================================================
--  0024_sale_song_clip.sql
--  Lar leder velge HVOR i salgssangen avspillingen starter, og HVOR LENGE den
--  spiller (et klipp), i stedet for hele sangen fra start.
--   - sale_song_start_seconds: startpunkt i sekunder (default 0)
--   - sale_song_duration_seconds: lengde i sekunder (null = ut sangen)
-- ============================================================================

alter table public.profiles
  add column if not exists sale_song_start_seconds int not null default 0,
  add column if not exists sale_song_duration_seconds int;

comment on column public.profiles.sale_song_start_seconds is
  'Startpunkt (sekunder) for salgssangen på TV-visningen.';
comment on column public.profiles.sale_song_duration_seconds is
  'Hvor lenge (sekunder) salgssangen spiller. NULL = ut sangen.';
