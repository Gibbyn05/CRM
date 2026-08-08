-- ============================================================================
--  0029_reachr_1881_logo_and_preferences.sql
--  Reachr: kontroll av om en bedrift har registrert logo på 1881.no, og
--  lagring av brukerens siste valgte Reachr-søkefiltre.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  REACHR_1881_LOGO_CHECKS
--  Delt cache/logg for 1881-logokontroll, nøkkel = org.nr (samme bedrift gir
--  samme svar uansett hvilken selger som søker). Fungerer også som kø: rader
--  med utløpt expires_at (eller som mangler) blir plukket opp igjen ved neste
--  kontroll i stedet for å bygges som en separat jobbtabell.
-- ---------------------------------------------------------------------------
create table if not exists public.reachr_1881_logo_checks (
  org_number      char(9) primary key,
  -- Kun bedriftsnavnet vi kontrollerte mot (til revisjon) — ikke adresse eller
  -- telefon, siden det ikke trengs for å forklare status i ettertid.
  name_snapshot   text not null,
  status          text not null default 'not_checked',
  match_method    text not null default 'none',
  provider        text not null default '1881',
  message         text,
  attempt_count   integer not null default 0,
  checked_by      uuid references public.profiles (id) on delete set null,
  checked_at      timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint reachr_1881_logo_checks_org_number_digits check (org_number ~ '^[0-9]{9}$'),
  constraint reachr_1881_logo_checks_status_check
    check (status in ('found', 'not_found', 'uncertain', 'not_checked')),
  constraint reachr_1881_logo_checks_match_method_check
    check (match_method in ('org_number', 'name_address_phone', 'none'))
);

comment on table public.reachr_1881_logo_checks is
  'Cache/logg for kontroll av om en bedrift har registrert logo på 1881.no. Delt på tvers av selgere.';
comment on column public.reachr_1881_logo_checks.match_method is
  'Hvordan bedriften ble matchet mot 1881-treffet: org_number (sikrest), name_address_phone, eller none (ingen match/ikke kontrollert).';
comment on column public.reachr_1881_logo_checks.expires_at is
  'Cache-utløp. Bekreftede svar (found/not_found) caches lenge; usikre/ikke-kontrollerte prøves på nytt raskere.';

create index if not exists reachr_1881_logo_checks_expires_idx
  on public.reachr_1881_logo_checks (expires_at);

drop trigger if exists reachr_1881_logo_checks_set_updated_at on public.reachr_1881_logo_checks;
create trigger reachr_1881_logo_checks_set_updated_at
  before update on public.reachr_1881_logo_checks
  for each row execute function public.set_updated_at();

alter table public.reachr_1881_logo_checks enable row level security;

-- Ikke personopplysninger (kun offentlig bedriftsinfo) — alle innloggede
-- selgere kan lese og bidra til cachen, tilsvarende dagens Reachr-søk.
drop policy if exists reachr_1881_logo_checks_select on public.reachr_1881_logo_checks;
create policy reachr_1881_logo_checks_select on public.reachr_1881_logo_checks
  for select to authenticated using (true);

drop policy if exists reachr_1881_logo_checks_insert on public.reachr_1881_logo_checks;
create policy reachr_1881_logo_checks_insert on public.reachr_1881_logo_checks
  for insert to authenticated with check (true);

drop policy if exists reachr_1881_logo_checks_update on public.reachr_1881_logo_checks;
create policy reachr_1881_logo_checks_update on public.reachr_1881_logo_checks
  for update to authenticated using (true) with check (true);

grant select, insert, update on public.reachr_1881_logo_checks to authenticated;

-- ---------------------------------------------------------------------------
--  PROFILES: husk siste valgte Reachr-søkefiltre (f.eks. 1881-logofilteret)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists reachr_search_preferences jsonb not null default '{}'::jsonb;

comment on column public.profiles.reachr_search_preferences is
  'Husker brukerens siste valgte Reachr-søkefiltre, f.eks. {"exclude_1881_logo": true}.';
