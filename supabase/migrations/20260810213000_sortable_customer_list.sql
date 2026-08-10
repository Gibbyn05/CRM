create or replace function public.get_customers_sorted(
  p_query text default '',
  p_kind text default 'kunder',
  p_sort text default 'last_activity',
  p_ascending boolean default false,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  id uuid,
  name text,
  org_number text,
  contact_name text,
  email text,
  phone text,
  city text,
  status_id uuid,
  status_name text,
  status_color text,
  owner_id uuid,
  seller_name text,
  customer_since date,
  created_at timestamptz,
  updated_at timestamptz,
  last_activity_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with enriched as (
    select
      c.id,
      c.name,
      c.org_number,
      c.contact_name,
      c.email,
      c.phone,
      c.city,
      c.status_id,
      cs.name as status_name,
      cs.color as status_color,
      c.owner_id,
      coalesce(nullif(p.full_name, ''), p.email, 'Ikke tildelt') as seller_name,
      c.customer_since,
      c.created_at,
      c.updated_at,
      greatest(
        c.updated_at,
        coalesce((select max(coalesce(cl.ended_at, cl.started_at, cl.created_at)) from public.call_logs cl where cl.customer_id = c.id), c.updated_at),
        coalesce((select max(n.created_at) from public.notes n where n.customer_id = c.id), c.updated_at),
        coalesce((select max(a.updated_at) from public.appointments a where a.customer_id = c.id), c.updated_at),
        coalesce((select max(r.updated_at) from public.reminders r where r.customer_id = c.id), c.updated_at),
        coalesce((select max(d.updated_at) from public.deals d where d.customer_id = c.id), c.updated_at),
        coalesce((select max(ct.updated_at) from public.contracts ct where ct.customer_id = c.id), c.updated_at),
        coalesce((select max(cm.updated_at) from public.commissions cm where cm.customer_id = c.id), c.updated_at),
        coalesce((select max(se.occurred_at) from public.customer_status_events se where se.customer_id = c.id), c.updated_at)
      ) as last_activity_at
    from public.customers c
    left join public.customer_statuses cs on cs.id = c.status_id
    left join public.profiles p on p.id = c.owner_id
    where
      (case when p_kind = 'potensielle' then c.customer_since is null else c.customer_since is not null end)
      and (
        nullif(trim(p_query), '') is null
        or c.name ilike '%' || trim(p_query) || '%'
        or c.org_number ilike regexp_replace(p_query, '\D', '', 'g') || '%'
        or c.phone_digits ilike '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
      )
  ),
  counted as (
    select e.*, count(*) over () as total_count from enriched e
  )
  select * from counted
  order by
    case when p_sort = 'name' and p_ascending then name end asc nulls last,
    case when p_sort = 'name' and not p_ascending then name end desc nulls last,
    case when p_sort = 'created' and p_ascending then created_at end asc nulls last,
    case when p_sort = 'created' and not p_ascending then created_at end desc nulls last,
    case when p_sort = 'last_activity' and p_ascending then last_activity_at end asc nulls last,
    case when p_sort = 'last_activity' and not p_ascending then last_activity_at end desc nulls last,
    case when p_sort = 'status' and p_ascending then status_name end asc nulls last,
    case when p_sort = 'status' and not p_ascending then status_name end desc nulls last,
    case when p_sort = 'seller' and p_ascending then seller_name end asc nulls last,
    case when p_sort = 'seller' and not p_ascending then seller_name end desc nulls last,
    case when p_sort = 'city' and p_ascending then city end asc nulls last,
    case when p_sort = 'city' and not p_ascending then city end desc nulls last,
    case when p_sort = 'org_number' and p_ascending then org_number end asc nulls last,
    case when p_sort = 'org_number' and not p_ascending then org_number end desc nulls last,
    id asc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke execute on function public.get_customers_sorted(text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.get_customers_sorted(text, text, text, boolean, integer, integer) to authenticated;
