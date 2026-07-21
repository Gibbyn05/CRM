-- ============================================================================
--  0004_realtime.sql
--  Aktiverer Supabase Realtime for tabellene som driver live-oppdateringer
--  uten refresh: agent_states (live-tavle), messages (chat), notes/deals
--  (kundekort-oppdateringer i sanntid).
--
--  supabase_realtime-publikasjonen finnes normalt allerede i Supabase;
--  vi legger til tabellene idempotent.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end$$;

alter publication supabase_realtime add table public.agent_states;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.deals;
alter publication supabase_realtime add table public.call_logs;

-- REPLICA IDENTITY FULL gjør at gamle verdier følger med i update/delete-
-- hendelser (nyttig for klienten når rader endres).
alter table public.agent_states replica identity full;
alter table public.messages     replica identity full;
alter table public.deals         replica identity full;
