-- Eksisterende duplikater beholdes for kontrollert sammenslåing. Nye
-- duplikater blokkeres atomisk, også når to enheter sender samtidig.
create or replace function public.prevent_duplicate_customer_org_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.org_number is not null and exists (
    select 1 from public.customers c
    where c.org_number = new.org_number and c.id <> new.id
  ) then
    raise exception using
      errcode = '23505',
      message = 'En kunde med dette organisasjonsnummeret finnes allerede.';
  end if;
  return new;
end;
$$;

drop trigger if exists customers_prevent_duplicate_org_number on public.customers;
create trigger customers_prevent_duplicate_org_number
  before insert or update of org_number on public.customers
  for each row execute function public.prevent_duplicate_customer_org_number();

create or replace function public.prevent_rapid_duplicate_deal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.deals d
    where d.customer_id = new.customer_id
      and lower(trim(d.title)) = lower(trim(new.title))
      and coalesce(d.amount, 0) = coalesce(new.amount, 0)
      and d.stage = new.stage
      and d.created_at > now() - interval '30 seconds'
  ) then
    raise exception using
      errcode = '23505',
      message = 'Denne avtalen ble nettopp opprettet.';
  end if;
  return new;
end;
$$;

drop trigger if exists deals_prevent_rapid_duplicate on public.deals;
create trigger deals_prevent_rapid_duplicate
  before insert on public.deals
  for each row execute function public.prevent_rapid_duplicate_deal();

revoke execute on function public.prevent_duplicate_customer_org_number() from public, anon, authenticated;
revoke execute on function public.prevent_rapid_duplicate_deal() from public, anon, authenticated;
