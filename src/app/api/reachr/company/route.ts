import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  BrregEntity,
  normalizeBrregEntity,
  normalizeFinancials,
  normalizeRoles,
} from "@/lib/reachr";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "reachr:company",
    limit: 80,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const orgnr = (req.nextUrl.searchParams.get("orgnr") ?? "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(orgnr)) {
    return NextResponse.json({ error: "Organisasjonsnummer må være 9 siffer." }, { status: 400 });
  }

  try {
    const [entityRes, rolesRes, financialsRes] = await Promise.all([
      fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 3600 },
      }),
      fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}/roller`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 3600 },
      }),
      fetch(`https://data.brreg.no/regnskapsregisteret/regnskap/${orgnr}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 86400 },
      }),
    ]);

    if (entityRes.status === 404) {
      return NextResponse.json({ error: "Fant ikke bedriften." }, { status: 404 });
    }
    if (!entityRes.ok) {
      return NextResponse.json({ error: "Brønnøysund svarte ikke akkurat nå." }, { status: 502 });
    }

    const company = normalizeBrregEntity((await entityRes.json()) as BrregEntity);
    const roles = rolesRes.ok ? normalizeRoles(await rolesRes.json()) : [];
    const financials = financialsRes.ok ? normalizeFinancials(await financialsRes.json()) : null;

    return NextResponse.json({ company: { ...company, roles, financials } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return NextResponse.json({ error: `Kunne ikke hente firmadetaljer: ${message}` }, { status: 502 });
  }
}
