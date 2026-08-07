-- ============================================================================
--  0026_deal_contract_text.sql
--  Lagrer det AI-genererte kontraktforslaget på tilbudet, slik at det kan
--  gjenbrukes ved fakturering.
-- ============================================================================

alter table public.deals
  add column if not exists contract_text text;

comment on column public.deals.contract_text is
  'AI-generert/redigert kontraktforslag for tilbudet.';
