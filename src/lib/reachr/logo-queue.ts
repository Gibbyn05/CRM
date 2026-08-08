import { createAdminClient } from "@/lib/supabase/admin";
import {
  check1881Logo,
  isLogo1881Configured,
  type Logo1881CheckInput,
  type Logo1881MatchMethod,
  type Logo1881Status,
} from "./providers/logo1881";

// ============================================================================
//  Kø + cache for 1881-logokontroll. "Køen" er selve cache-tabellen: rader
//  med utløpt (eller manglende) expires_at plukkes opp på nytt neste gang en
//  selger søker på bedriften, i stedet for en egen jobbtabell — enklere og
//  fungerer likt uansett hvem som trigger kontrollen.
//
//  Kontrollert hastighet: bedrifter som må sjekkes på nytt prosesseres i
//  små, samtidige puljer (ikke alle på én gang) for å unngå å overbelaste
//  1881 ved store søk. Midlertidige feil (nettverk/5xx) prøves på nytt et
//  begrenset antall ganger; endelige feil/avvisninger gjentas ikke.
// ============================================================================

export const LOGO_CHECK_FOUND_CACHE_DAYS = 30;
export const LOGO_CHECK_RETRY_CACHE_HOURS = 6;
export const MAX_LOGO_CHECK_ATTEMPTS = 3;
export const LOGO_CHECK_CONCURRENCY = 3;

export interface LogoCheckOutcome {
  org_number: string;
  status: Logo1881Status;
  match_method: Logo1881MatchMethod;
  checked_at: string | null;
  message?: string;
  from_cache: boolean;
}

interface LogoCheckCacheRow {
  org_number: string;
  status: Logo1881Status;
  match_method: Logo1881MatchMethod;
  message: string | null;
  attempt_count: number;
  checked_at: string | null;
  expires_at: string | null;
}

type AdminClient = ReturnType<typeof createAdminClient>;

export async function checkLogos(
  companies: Logo1881CheckInput[],
  userId: string,
): Promise<LogoCheckOutcome[]> {
  const admin = createAdminClient();
  const orgNumbers = companies.map((c) => c.org_number);

  const { data: cachedRows } = await admin
    .from("reachr_1881_logo_checks")
    .select("org_number, status, match_method, message, attempt_count, checked_at, expires_at")
    .in("org_number", orgNumbers);
  const cache = new Map<string, LogoCheckCacheRow>(
    ((cachedRows as LogoCheckCacheRow[] | null) ?? []).map((row) => [row.org_number, row]),
  );

  const now = Date.now();
  const toCheck: Logo1881CheckInput[] = [];
  const results: LogoCheckOutcome[] = [];

  for (const company of companies) {
    const cached = cache.get(company.org_number);
    const isFresh = Boolean(cached?.expires_at && new Date(cached.expires_at).getTime() > now);
    if (cached && isFresh) {
      results.push({
        org_number: company.org_number,
        status: cached.status,
        match_method: cached.match_method,
        checked_at: cached.checked_at,
        message: cached.message ?? undefined,
        from_cache: true,
      });
    } else {
      toCheck.push(company);
    }
  }

  for (let i = 0; i < toCheck.length; i += LOGO_CHECK_CONCURRENCY) {
    const batch = toCheck.slice(i, i + LOGO_CHECK_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((company) => checkOneWithRetry(company, cache.get(company.org_number))),
    );
    results.push(...batchResults);
    await persistResults(admin, batch, batchResults, userId);
  }

  return results;
}

async function checkOneWithRetry(
  company: Logo1881CheckInput,
  cached: LogoCheckCacheRow | undefined,
): Promise<LogoCheckOutcome & { attempt_count: number }> {
  // Uten reell konfigurasjon vil hvert forsøk gi identisk "not_checked" —
  // ikke bruk retry-budsjett på noe som aldri kan lykkes.
  const maxAttempts = isLogo1881Configured() ? MAX_LOGO_CHECK_ATTEMPTS : 1;
  let attemptCount = cached?.attempt_count ?? 0;
  let lastResult = await check1881Logo(company);
  attemptCount++;

  for (let attempt = 1; attempt < maxAttempts && lastResult.transient; attempt++) {
    await sleep(300 * 2 ** (attempt - 1));
    lastResult = await check1881Logo(company);
    attemptCount++;
  }

  return {
    org_number: company.org_number,
    status: lastResult.status,
    match_method: lastResult.match_method,
    checked_at: new Date().toISOString(),
    message: lastResult.message,
    from_cache: false,
    attempt_count: attemptCount,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistResults(
  admin: AdminClient,
  companies: Logo1881CheckInput[],
  results: (LogoCheckOutcome & { attempt_count: number })[],
  userId: string,
): Promise<void> {
  const rows = results.map((result, index) => ({
    org_number: result.org_number,
    name_snapshot: companies[index].name,
    status: result.status,
    match_method: result.match_method,
    provider: "1881",
    message: result.message ?? null,
    attempt_count: result.attempt_count,
    checked_by: userId,
    checked_at: result.checked_at,
    expires_at: new Date(
      Date.now() +
        (result.status === "found" || result.status === "not_found"
          ? LOGO_CHECK_FOUND_CACHE_DAYS * 86_400_000
          : LOGO_CHECK_RETRY_CACHE_HOURS * 3_600_000),
    ).toISOString(),
  }));

  const { error } = await admin
    .from("reachr_1881_logo_checks")
    .upsert(rows, { onConflict: "org_number" });
  if (error) {
    console.error("Kunne ikke lagre 1881-logokontroll:", error.message);
  }
}
