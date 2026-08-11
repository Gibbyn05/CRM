create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null check (email = lower(email)),
  full_name text not null check (length(trim(full_name)) > 0),
  role public.user_role not null default 'agent',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  token_hash text not null unique check (length(token_hash) = 64),
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  last_sent_at timestamptz,
  send_count integer not null default 0 check (send_count >= 0),
  email_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_invitations_pending_email_unique
  on public.user_invitations (lower(email)) where status = 'pending';
create index if not exists user_invitations_status_expires_idx
  on public.user_invitations (status, expires_at desc);

drop trigger if exists user_invitations_set_updated_at on public.user_invitations;
create trigger user_invitations_set_updated_at before update on public.user_invitations
  for each row execute function public.set_updated_at();

alter table public.user_invitations enable row level security;
drop policy if exists user_invitations_manager_select on public.user_invitations;
create policy user_invitations_manager_select on public.user_invitations
  for select to authenticated using (public.is_manager());

revoke all on public.user_invitations from anon;
revoke insert, update, delete on public.user_invitations from authenticated;
grant select on public.user_invitations to authenticated;

comment on table public.user_invitations is 'Engangsinvitasjoner opprettet av ledere. Bare SHA-256-hash av token lagres.';

-- Nye Auth-brukere starter alltid som selger. Autoritativ rolle settes av det
-- lederbeskyttede aksept-endepunktet fra invitasjonsraden.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'agent'
  )
  on conflict (id) do nothing;

  insert into public.agent_states (agent_id, status)
  values (new.id, 'offline')
  on conflict (agent_id) do nothing;
  return new;
end;
$$;
