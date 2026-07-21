-- ============================================================================
--  0005_storage_avatars.sql
--  Storage-bucket for profilbilder (avatarer). Offentlig lesbar; innloggede
--  brukere kan laste opp/erstatte bilder. Filnavn prefikses med bruker-id i
--  appen (f.eks. "<uid>/avatar.png").
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Les: alle (bucket er offentlig).
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select
  using (bucket_id = 'avatars');

-- Last opp: innloggede brukere.
drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars');

-- Oppdater/erstatt: innloggede brukere.
drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars');
