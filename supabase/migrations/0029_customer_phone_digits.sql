-- Format-uavhengig telefonsøk: en generert kolonne som kun inneholder sifrene
-- i telefonnummeret (fjerner mellomrom, +, parenteser osv.), pluss en trigram-
-- indeks for raske «inneholder»-søk. Dermed matcher «48 34», «4834» og «483»
-- alle samme nummer.

create extension if not exists pg_trgm;

alter table public.customers
  add column if not exists phone_digits text
  generated always as (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored;

create index if not exists customers_phone_digits_trgm
  on public.customers using gin (phone_digits gin_trgm_ops);
