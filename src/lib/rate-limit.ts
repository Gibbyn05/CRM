import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
//  Delt rate limiting for API-endepunkter (IP- og bruker-basert).
//
//  Backes av rl_hit() i Postgres, som er atomisk og deles på tvers av alle
//  serverless-instanser (i motsetning til en in-memory teller). Feiler «åpent»:
//  hvis tellerlageret er utilgjengelig, slippes forespørselen gjennom slik at
//  rate limiting aldri kan ta ned appen.
// ============================================================================

export interface RateLimitOptions {
  // Navn på endepunktet – brukes til å adskille nøkler (f.eks. "contracts:send").
  name: string;
  // Grense og vindu for bruker-nøkkelen (og IP-nøkkelen om ikke overstyrt).
  limit: number;
  windowSeconds: number;
  // Sett når brukeren er autentisert – gir en egen bruker-basert grense.
  userId?: string | null;
  // Overstyr IP-grensen (default = limit/windowSeconds).
  ipLimit?: number;
  ipWindowSeconds?: number;
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

// Beste tilgjengelige klient-IP. Vercel/proxy setter x-forwarded-for.
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

type HitRow = { allowed: boolean; remaining: number; reset_at: string };

async function hit(
  admin: ReturnType<typeof createAdminClient>,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetSeconds: number } | null> {
  const { data, error } = await admin.rpc("rl_hit", {
    p_key: key,
    p_limit: limit,
    p_window: windowSeconds,
  });
  const row = (data as HitRow[] | null)?.[0];
  if (error || !row) return null; // fail-open
  const resetSeconds = Math.max(
    0,
    Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000),
  );
  return { allowed: row.allowed, remaining: row.remaining, resetSeconds };
}

// Registrerer ett treff og returnerer om forespørselen er innenfor grensene.
// Sjekker både IP-nøkkel og (om userId er satt) bruker-nøkkel; den strengeste
// vinner.
export async function rateLimit(
  req: NextRequest,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  // Uten service-role-nøkkel kan vi ikke telle – slipp gjennom (fail-open).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: true, limit: opts.limit, remaining: opts.limit, resetSeconds: 0 };
  }

  const admin = createAdminClient();
  const ip = getClientIp(req);
  const ipLimit = opts.ipLimit ?? opts.limit;
  const ipWindow = opts.ipWindowSeconds ?? opts.windowSeconds;

  const jobs = [hit(admin, `${opts.name}:ip:${ip}`, ipLimit, ipWindow)];
  if (opts.userId) {
    jobs.push(
      hit(admin, `${opts.name}:user:${opts.userId}`, opts.limit, opts.windowSeconds),
    );
  }

  const results = await Promise.all(jobs);

  let ok = true;
  let remaining = Number.POSITIVE_INFINITY;
  let resetSeconds = 0;
  for (const r of results) {
    if (!r) continue; // fail-open for den sjekken
    if (!r.allowed) ok = false;
    remaining = Math.min(remaining, r.remaining);
    resetSeconds = Math.max(resetSeconds, r.resetSeconds);
  }
  if (!Number.isFinite(remaining)) remaining = opts.limit;

  return { ok, limit: opts.limit, remaining, resetSeconds };
}

// Bygger et pent 429-svar med standard rate-limit-headere.
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retry = Math.max(1, result.resetSeconds);
  return NextResponse.json(
    {
      error: "For mange forespørsler. Vent litt og prøv igjen.",
      retry_after_seconds: retry,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retry),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
        "X-RateLimit-Reset": String(result.resetSeconds),
      },
    },
  );
}

// Bekvem hjelper: kjør rate limit og returner enten et 429-svar (blokker) eller
// null (fortsett).
export async function enforceRateLimit(
  req: NextRequest,
  opts: RateLimitOptions,
): Promise<NextResponse | null> {
  const result = await rateLimit(req, opts);
  return result.ok ? null : rateLimitResponse(result);
}
