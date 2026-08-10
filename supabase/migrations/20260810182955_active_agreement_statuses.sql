alter table public.contracts
  add column due_at timestamptz;

alter table public.commissions
  add column due_at timestamptz;

comment on column public.contracts.due_at is
  'Frist for signering. Nye signeringsforespørsler bruker normalt 14 dager.';
comment on column public.commissions.due_at is
  'Betalingsfrist fra Fiken-fakturaen.';

update public.contracts
set due_at = coalesce(sent_at, created_at) + interval '14 days'
where due_at is null;

update public.commissions
set due_at = invoiced_at + interval '14 days'
where due_at is null and invoiced_at is not null;

create index contracts_due_idx on public.contracts (due_at)
  where due_at is not null;
create index commissions_due_idx on public.commissions (due_at)
  where due_at is not null;

create or replace function public.get_active_agreements()
returns table (
  deal_id uuid,
  agent_id uuid,
  agent_name text,
  customer_id uuid,
  customer_name text,
  title text,
  amount numeric,
  currency text,
  agreement_status text,
  due_at timestamptz,
  is_overdue boolean,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.id,
    d.agent_id,
    coalesce(nullif(p.full_name, ''), p.email, 'Ukjent'),
    d.customer_id,
    cu.name,
    d.title,
    d.amount,
    d.currency,
    case
      when cm.status = 'betalt' then 'betalt'
      when ct.status = 'signed' then 'signert'
      else 'tilbud_sendt'
    end,
    case when ct.status = 'signed' then cm.due_at else ct.due_at end,
    (
      (coalesce(ct.status, 'draft') <> 'signed' and ct.due_at < now())
      or (
        ct.status = 'signed'
        and coalesce(cm.status, 'ikke_fakturert') <> 'betalt'
        and (cm.status = 'forfalt' or cm.due_at < now())
      )
    ),
    greatest(d.updated_at, coalesce(ct.updated_at, d.updated_at), coalesce(cm.updated_at, d.updated_at))
  from public.deals d
  join public.customers cu on cu.id = d.customer_id
  left join public.profiles p on p.id = d.agent_id
  left join lateral (
    select c.id, c.status, c.due_at, c.updated_at
    from public.contracts c
    where c.deal_id = d.id
    order by (c.status = 'signed') desc, c.created_at desc
    limit 1
  ) ct on true
  left join public.commissions cm on cm.deal_id = d.id
  where d.stage <> 'tapt'
    and (d.offer_sent_at is not null or ct.id is not null or cm.id is not null)
    and ((select public.is_manager()) or d.agent_id = (select auth.uid()))
  order by 11 desc, 12 desc;
$$;

revoke execute on function public.get_active_agreements() from public, anon;
grant execute on function public.get_active_agreements() to authenticated;

comment on function public.get_active_agreements() is
  'Aktive avtaler med eierbasert innsyn for selgere og teaminnsyn for ledere.';
