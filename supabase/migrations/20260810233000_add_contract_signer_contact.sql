alter table public.contracts
  add column if not exists signer_email text,
  add column if not exists signer_phone text;

comment on column public.contracts.signer_email is
  'E-postadressen signatøren oppga ved elektronisk signering.';
comment on column public.contracts.signer_phone is
  'Telefonnummeret signatøren oppga ved elektronisk signering.';
