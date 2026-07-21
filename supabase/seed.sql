-- ============================================================================
--  seed.sql
--  Eksempeldata for lokal utvikling. Kjør ETTER at du har opprettet
--  auth-brukere (via Supabase Studio eller signup), siden profiles henger
--  på auth.users.
--
--  Enkleste vei lokalt: opprett 3-4 brukere i Supabase Studio, kopier deres
--  UUID-er inn under, og kjør resten. Alternativt tilpass etter behov.
-- ============================================================================

-- Eksempelkunder (uavhengige av auth — trygge å seede direkte).
insert into public.customers (name, org_number, contact_name, email, phone, city)
values
  ('Nordvik Bygg AS',        '912345678', 'Kari Nordvik',   'kari@nordvikbygg.no',   '90012345', 'Bergen'),
  ('Fjord Consulting AS',    '923456789', 'Ola Hansen',     'ola@fjordconsulting.no','40023456', 'Oslo'),
  ('Sør IT Solutions AS',    '934567890', 'Per Solberg',    'per@sorit.no',          '92034567', 'Kristiansand'),
  ('Vestland Transport AS',  '945678901', 'Nina Aas',       'nina@vestlandtransport.no','48045678', 'Førde'),
  ('Arktisk Sjømat AS',      '956789012', 'Lars Berg',      'lars@arktisksjomat.no', '95056789', 'Tromsø')
on conflict do nothing;

-- Merk: deals/appointments/notes/call_logs krever gyldige agent-UUID-er.
-- Legg dem til manuelt etter at du har brukere, f.eks.:
--
--   insert into public.deals (customer_id, agent_id, title, stage, amount)
--   select c.id, '<agent-uuid>', 'Årsavtale', 'tilbud_sendt', 120000
--   from public.customers c where c.name = 'Nordvik Bygg AS';
