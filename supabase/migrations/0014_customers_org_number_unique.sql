-- Hindrer utilsiktede duplikate kunder på samme organisasjonsnummer.
-- "Ny kunde"-flyten viser og blokkerer duplikater i UI (se
-- src/components/NewCustomerButton.tsx), men uten en unik indeks kan to
-- selgere fortsatt lagre samme org.nr samtidig. Gjelder alle kunder på tvers
-- av eiere (partial index, ekskluderer null slik at kunder uten org.nr ikke
-- er berørt).

create unique index if not exists customers_org_number_unique_idx
  on public.customers (org_number)
  where org_number is not null;
