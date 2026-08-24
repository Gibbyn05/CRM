-- Systemadministratorer er høyere enn vanlige ledere. Dette er en
-- databasebeskyttelse, slik at den også gjelder ved direkte API-kall.

alter table public.profiles
  add column if not exists is_system_admin boolean not null default false;

comment on column public.profiles.is_system_admin is
  'Låst systemadministrator. Rollen kan ikke endres, deaktiveres eller slettes gjennom CRM-et.';

-- De to eksisterende kontoene utpekes før triggeren aktiveres.
update public.profiles
set role = 'manager', is_active = true, is_system_admin = true
where id in (
  'a9898a8b-bc33-4bef-af96-d93cbb543d7b'::uuid,
  '8549104c-925a-4f8e-b1ff-916486ab81c1'::uuid
);

update auth.users
set banned_until = null
where id in (
  'a9898a8b-bc33-4bef-af96-d93cbb543d7b'::uuid,
  '8549104c-925a-4f8e-b1ff-916486ab81c1'::uuid
);

create or replace function public.protect_system_administrator_profile()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_system_admin then
      raise exception using
        errcode = '42501',
        message = 'Systemadministratorer kan bare opprettes gjennom en kontrollert databaseendring.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_system_admin then
      raise exception using
        errcode = '42501',
        message = 'Denne systemadministratorkontoen kan ikke slettes.';
    end if;
    return old;
  end if;

  if old.is_system_admin then
    if new.is_system_admin is distinct from true
      or new.role is distinct from 'manager'::public.user_role
      or new.is_active is distinct from true then
      raise exception using
        errcode = '42501',
        message = 'Systemadministratorkontoen kan ikke endres til selger, deaktiveres eller fratas beskyttelsen.';
    end if;
  elsif new.is_system_admin then
    raise exception using
      errcode = '42501',
      message = 'Systemadministratorstatus kan ikke tildeles gjennom CRM-et.';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_system_administrator_profile() from public, anon, authenticated;

drop trigger if exists protect_system_administrator_profile on public.profiles;
create trigger protect_system_administrator_profile
before insert or update or delete on public.profiles
for each row execute function public.protect_system_administrator_profile();
