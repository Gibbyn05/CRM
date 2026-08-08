-- Skille faktiske kunder fra potensielle kunder.
--
-- customer_since settes når kunden får sitt første VUNNE salg (deal-stage
-- 'akseptert'). null = potensiell kunde (kontaktet, ikke avklart).
-- Brukes til to faner på Kunder-siden: «Kunder» vs «Potensielle».

alter table public.customers
  add column if not exists customer_since timestamptz;

-- Backfill: alle kunder som allerede har minst ett vunnet salg regnes som kunder.
update public.customers c
set customer_since = sub.first_won
from (
  select customer_id,
         min(coalesce(offer_accepted_at, updated_at)) as first_won
  from public.deals
  where stage = 'akseptert'
  group by customer_id
) sub
where c.id = sub.customer_id
  and c.customer_since is null;

-- Trigger: marker kunden som «kunde» første gang en deal blir 'akseptert'.
create or replace function public.mark_customer_on_won()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage = 'akseptert' and (old.stage is distinct from 'akseptert') then
    update public.customers
      set customer_since = coalesce(customer_since, now())
      where id = new.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists deals_mark_customer_on_won on public.deals;
create trigger deals_mark_customer_on_won
  after insert or update of stage on public.deals
  for each row execute function public.mark_customer_on_won();
