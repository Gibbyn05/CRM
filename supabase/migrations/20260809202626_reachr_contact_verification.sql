-- Store both the chosen contact and the evaluated alternatives. This makes it
-- possible to explain why Reachr selected a number and to audit rejected
-- person matches without creating a separately exposed person-data table.
alter table public.reachr_leads
  add column if not exists contact_candidates jsonb not null default '[]'::jsonb,
  add column if not exists selected_contact jsonb;

comment on column public.reachr_leads.contact_candidates is
  'Kontaktkandidater med kilde, prioritet, verifiseringsscore og avvisningsgrunn.';
comment on column public.reachr_leads.selected_contact is
  'Valgt kontakt etter prioritet: daglig leder, styreleder, bedriftens hovednummer.';

alter table public.reachr_leads
  drop constraint if exists reachr_leads_contact_candidates_array,
  add constraint reachr_leads_contact_candidates_array
    check (jsonb_typeof(contact_candidates) = 'array'),
  drop constraint if exists reachr_leads_selected_contact_object,
  add constraint reachr_leads_selected_contact_object
    check (selected_contact is null or jsonb_typeof(selected_contact) = 'object');

-- Keep Data API access explicit. Row visibility remains governed by the RLS
-- policies already defined for reachr_leads.
grant select, insert, update, delete on table public.reachr_leads to authenticated;
