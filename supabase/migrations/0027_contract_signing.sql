-- Enkel, selvhostet e-signering av kontrakter.
--
-- Kunden får en e-post med en lenke /signer/<token>, åpner en offentlig side som
-- viser avtaleteksten, skriver fullt navn, huker av for aksept og signerer.
-- Vi lagrer navn, tidspunkt og IP som en «enkel elektronisk signatur» – gyldig
-- for ordinære B2B-salgsavtaler.
--
-- Legger til på den eksisterende contracts-tabellen:
--   sign_token     – offentlig, ikke-gjettbar nøkkel i signeringslenken
--   contract_text  – øyeblikksbilde av avtaleteksten som ble sendt
--   signer_name    – navnet kunden skrev inn ved signering
--   signer_ip      – IP-adressen signeringen kom fra (for sporbarhet)

alter table public.contracts
  add column if not exists sign_token uuid not null default gen_random_uuid(),
  add column if not exists contract_text text,
  add column if not exists signer_name text,
  add column if not exists signer_ip text;

-- Unik indeks slik at token kan slås opp direkte og aldri kolliderer.
create unique index if not exists contracts_sign_token_key
  on public.contracts (sign_token);
