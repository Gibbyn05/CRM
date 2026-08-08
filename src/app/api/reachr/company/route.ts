import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enrichCompanyFromProviders } from "@/lib/reachr/providers";
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
    // deep=1 slår på de tunge/betalte nummer-kildene (Proff-skrap + 1881) –
    // kun ved eksplisitt «Søk etter nummer», ikke ved bulk-berikelse.
    const deep = req.nextUrl.searchParams.get("deep") === "1";
    const company = await enrichCompanyFromProviders(orgnr, { deep });
    if (!company) {
      return NextResponse.json({ error: "Fant ikke bedriften." }, { status: 404 });
    }
    return NextResponse.json({ company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return NextResponse.json({ error: `Kunne ikke hente firmadetaljer: ${message}` }, { status: 502 });
  }
}
