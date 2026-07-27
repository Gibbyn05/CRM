-- ============================================================================
--  0013_rate_limits.sql
--  Delt (på tvers av serverless-instanser) rate limiting for API-endepunkter.
--  En fast-inkrementerende teller pr. nøkkel i et tidsvindu. Tabellen er ikke
--  eksponert til klienter (RLS på, ingen policyer) – kun service-role (som
--  bypasser RLS) og rl_hit() (security definer) rører den.
-- ============================================================================

create table public.rate_limits (
  key          text primary key,
  count        integer not null default 0,
  window_start timestamptz not null default now()
);

comment on table public.rate_limits is
  'Rate-limit-tellere pr. nøkkel (endepunkt:ip / endepunkt:user). Kun service-role.';

alter table public.rate_limits enable row level security;
-- Ingen policyer: kun service-role og rl_hit() (security definer) har tilgang.

-- Registrer ett treff på en nøkkel og returner om det er innenfor grensen.
-- Atomisk via UPSERT: teller nullstilles når vinduet er utløpt.
create or replace function public.rl_hit(
  p_key text,
  p_limit integer,
  p_window integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_start timestamptz;
begin
  insert into public.rate_limits (key, count, window_start)
    values (p_key, 1, now())
  on conflict (key) do update set
    count = case
      when rate_limits.window_start < now() - make_interval(secs => p_window)
      then 1
      else rate_limits.count + 1
    end,
    window_start = case
      when rate_limits.window_start < now() - make_interval(secs => p_window)
      then now()
      else rate_limits.window_start
    end
  returning count, window_start into v_count, v_start;

  allowed := v_count <= p_limit;
  remaining := greatest(0, p_limit - v_count);
  reset_at := v_start + make_interval(secs => p_window);
  return next;
end;
$$;

-- Opprydding av gamle tellere (utløpte vinduer). Kan kjøres periodisk (cron)
-- eller manuelt; ikke kritisk for korrekthet siden nøkler gjenbrukes.
create or replace function public.rl_cleanup(p_older_than_seconds integer default 3600)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
    where window_start < now() - make_interval(secs => p_older_than_seconds);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
