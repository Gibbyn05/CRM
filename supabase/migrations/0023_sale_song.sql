-- ============================================================================
--  0023_sale_song.sql
--  «Salgssang» per selger: når selgeren får et salg spilles sangen av på
--  TV-visningen (kun der). Ledere velger sang per selger.
--   - profiles.sale_song_url: lenke til lydfil (opplastet eller ekstern URL)
--   - storage-bucket «sale-songs» for opplastede lydfiler
-- ============================================================================

alter table public.profiles
  add column if not exists sale_song_url text;

comment on column public.profiles.sale_song_url is
  'Lydfil som spilles på TV-visningen når selgeren får et salg.';

-- Offentlig lesbar bucket (TV-visningen er uinnlogget og må kunne hente lyden).
insert into storage.buckets (id, name, public)
values ('sale-songs', 'sale-songs', true)
on conflict (id) do nothing;

drop policy if exists "sale_songs_read" on storage.objects;
create policy "sale_songs_read" on storage.objects
  for select using (bucket_id = 'sale-songs');

drop policy if exists "sale_songs_write" on storage.objects;
create policy "sale_songs_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sale-songs' and public.is_manager());

drop policy if exists "sale_songs_update" on storage.objects;
create policy "sale_songs_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'sale-songs' and public.is_manager());

drop policy if exists "sale_songs_delete" on storage.objects;
create policy "sale_songs_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sale-songs' and public.is_manager());
