-- ============================================================================
--  0018_commission_on_won_deal.sql
--  Når en deal vinnes (stage = 'akseptert') opprettes automatisk en
--  provisjonsrad i commissions med organisasjonens sats (default 15 %).
--  Idempotent via unik deal_id: gjenåpning/omsetting dupliserer ikke.
--
--  Etterfyller også eksisterende vunne salg slik at regnskapsmenyen ikke
--  starter tom.
-- ============================================================================

-- Referanse til Fiken-fakturautkast (utkast har uuid, ikke invoiceId).
alter table public.commissions
  add column if not exists fiken_draft_uuid text;

-- ---------------------------------------------------------------------------
--  Trigger-funksjon: opprett provisjon når deal blir 'akseptert'.
-- ---------------------------------------------------------------------------
create or replace function public.create_commission_on_won()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate   numeric(6, 4);
  v_amount numeric(12, 2);
begin
  -- Kun ved overgang TIL 'akseptert' (eller insert som allerede er akseptert).
  if new.stage = 'akseptert'
     and (tg_op = 'INSERT' or old.stage is distinct from 'akseptert') then

    select coalesce(commission_rate, 0.15) into v_rate
    from public.organization where id = 1;
    if v_rate is null then v_rate := 0.15; end if;

    v_amount := coalesce(new.amount, 0);

    insert into public.commissions (
      deal_id, agent_id, customer_id,
      sale_amount, commission_rate, commission_amount, status
    )
    values (
      new.id, new.agent_id, new.customer_id,
      v_amount, v_rate, round(v_amount * v_rate, 2), 'ikke_fakturert'
    )
    on conflict (deal_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists deals_create_commission on public.deals;
create trigger deals_create_commission
  after insert or update of stage on public.deals
  for each row execute function public.create_commission_on_won();

-- ---------------------------------------------------------------------------
--  Etterfyll: lag provisjon for salg som allerede er vunnet.
-- ---------------------------------------------------------------------------
insert into public.commissions (
  deal_id, agent_id, customer_id,
  sale_amount, commission_rate, commission_amount, status
)
select
  d.id, d.agent_id, d.customer_id,
  coalesce(d.amount, 0),
  coalesce((select commission_rate from public.organization where id = 1), 0.15),
  round(
    coalesce(d.amount, 0)
      * coalesce((select commission_rate from public.organization where id = 1), 0.15),
    2
  ),
  'ikke_fakturert'
from public.deals d
where d.stage = 'akseptert'
on conflict (deal_id) do nothing;
