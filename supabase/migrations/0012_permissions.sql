-- ============================================================================
--  0012_permissions.sql
--  Tilgangsstyring: rollebasert rettighetsmatrise (se/opprett/endre/slett) pr.
--  ressurs. Ledere er alltid fulle administratorer. Standardverdiene gjenskaper
--  dagens oppførsel nøyaktig, så ingenting endres før en leder justerer matrisen.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  ROLLE-RETTIGHETER
-- ---------------------------------------------------------------------------
create table public.role_permissions (
  role        user_role not null,
  resource    text not null,           -- 'customers' | 'contracts' | 'events' | 'products'
  can_view    boolean not null default true,
  can_create  boolean not null default true,
  can_edit    boolean not null default true,
  can_delete  boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (role, resource)
);

comment on table public.role_permissions is
  'Rollebasert CRUD-rettighet pr. ressurs. Ledere er alltid fulle admin.';

create trigger role_permissions_set_updated_at
  before update on public.role_permissions
  for each row execute function public.set_updated_at();

-- Standard: ledere har alt; selgere speiler dagens regler.
insert into public.role_permissions (role, resource, can_view, can_create, can_edit, can_delete) values
  ('manager', 'customers', true, true, true, true),
  ('manager', 'contracts', true, true, true, true),
  ('manager', 'events',    true, true, true, true),
  ('manager', 'products',  true, true, true, true),
  ('agent',   'customers', true, true, true, false),
  ('agent',   'contracts', true, true, true, false),
  ('agent',   'events',    true, true, true, true),
  ('agent',   'products',  true, false, false, false)
on conflict (role, resource) do nothing;

alter table public.role_permissions enable row level security;

-- Alle innloggede kan lese matrisen (appen leser egne rettigheter).
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (true);

-- Kun ledere kan endre matrisen.
create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- ---------------------------------------------------------------------------
--  HJELPEFUNKSJON: har innlogget bruker rettighet til handling på ressurs?
--  Ledere -> alltid true. Ellers slås rollen opp i matrisen. Mangler rad ->
--  true (fail-open, så en manglende seed aldri låser teamet ute).
-- ---------------------------------------------------------------------------
create or replace function public.has_perm(p_resource text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_row  public.role_permissions;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null then
    return false;
  end if;
  if v_role = 'manager' then
    return true;
  end if;

  select * into v_row
    from public.role_permissions
    where role = v_role and resource = p_resource;
  if not found then
    return true; -- fail-open
  end if;

  return case p_action
    when 'view'   then v_row.can_view
    when 'create' then v_row.can_create
    when 'edit'   then v_row.can_edit
    when 'delete' then v_row.can_delete
    else false
  end;
end;
$$;

-- ---------------------------------------------------------------------------
--  Knytt «kundekort»-ressursen til RLS (kunder). Standardverdiene over gjør at
--  dette tilsvarer dagens oppførsel: selgere kan se/opprette/endre, kun ledere
--  kan slette – helt til en leder endrer matrisen.
-- ---------------------------------------------------------------------------
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert to authenticated
  with check (
    public.has_perm('customers', 'create')
    and (created_by = auth.uid() or public.is_manager())
  );

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated
  using (public.has_perm('customers', 'edit'))
  with check (public.has_perm('customers', 'edit'));

drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers
  for delete to authenticated
  using (public.has_perm('customers', 'delete'));
