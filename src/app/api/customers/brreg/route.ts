import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

// ============================================================================
//  Slår opp firmadata i Brønnøysundregistrene (Enhetsregisteret) fra org.nr.
//  Gratis, åpent API – ingen nøkkel. Brukes til å autofylle "Ny kunde".
//  Docs: https://data.brreg.no/enhetsregisteret/api/enheter/{orgnr}
// ============================================================================

interface BrregAddress {
  adresse?: string[];
  postnummer?: string;
  poststed?: string;
}
interface BrregEnhet {
  organisasjonsnummer?: string;
  navn?: string;
  forretningsadresse?: BrregAddress;
  postadresse?: BrregAddress;
  naeringskode1?: { beskrivelse?: string };
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "customers:brreg",
    limit: 30,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const orgnr = (req.nextUrl.searchParams.get("orgnr") ?? "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(orgnr)) {
    return NextResponse.json(
      { error: "Organisasjonsnummer må være 9 siffer." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (res.status === 404) {
      return NextResponse.json(
        { error: "Fant ingen bedrift med dette organisasjonsnummeret." },
        { status: 404 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: "Brønnøysund svarte ikke akkurat nå. Prøv igjen." },
        { status: 502 },
      );
    }

    const e = (await res.json()) as BrregEnhet;
    const addr = e.forretningsadresse ?? e.postadresse;

    return NextResponse.json({
      fields: {
        name: e.navn ?? "",
        org_number: e.organisasjonsnummer ?? orgnr,
        city: addr?.poststed
          ? capitalizeWords(addr.poststed)
          : "",
        address: (addr?.adresse ?? []).filter(Boolean).join(", "),
        postal_code: addr?.postnummer ?? "",
        industry: e.naeringskode1?.beskrivelse ?? "",
      },
    });
  } catch (err) {
    const m = err instanceof Error ? err.message : "Ukjent feil";
    return NextResponse.json(
      { error: "Kunne ikke kontakte Brønnøysund: " + m },
      { status: 502 },
    );
  }
}

function capitalizeWords(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
}
