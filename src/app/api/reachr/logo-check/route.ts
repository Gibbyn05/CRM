import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkLogos } from "@/lib/reachr/logo-queue";
import type { Logo1881CheckInput } from "@/lib/reachr/providers/logo1881";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_BATCH = 40;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "reachr:logo-check",
    limit: 30,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  let body: { companies?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }

  const companies = parseCompanies(body.companies);
  if (companies.length === 0) {
    return NextResponse.json({ error: "Ingen gyldige bedrifter å kontrollere." }, { status: 400 });
  }
  if (companies.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Maks ${MAX_BATCH} bedrifter kan kontrolleres per kall.` },
      { status: 400 },
    );
  }

  try {
    const results = await checkLogos(companies, user.id);
    const summary = {
      checked: results.length,
      kept: results.filter((r) => r.status !== "found").length,
      filtered_out: results.filter((r) => r.status === "found").length,
      uncertain: results.filter((r) => r.status === "uncertain").length,
      not_checked: results.filter((r) => r.status === "not_checked").length,
    };
    return NextResponse.json({ results, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return NextResponse.json({ error: `1881-kontroll feilet: ${message}` }, { status: 502 });
  }
}

function parseCompanies(value: unknown): Logo1881CheckInput[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const companies: Logo1881CheckInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const orgNumber = typeof row.org_number === "string" ? row.org_number.replace(/\s/g, "") : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!/^\d{9}$/.test(orgNumber) || !name || seen.has(orgNumber)) continue;
    seen.add(orgNumber);
    companies.push({
      org_number: orgNumber,
      name,
      address: typeof row.address === "string" && row.address.trim() ? row.address.trim() : null,
      phone: typeof row.phone === "string" && row.phone.trim() ? row.phone.trim() : null,
    });
  }
  return companies;
}
