import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CompanyNotFoundError,
  InvalidOrgNumberError,
  lookupCompany,
} from "@/lib/company-lookup";

// ============================================================================
//  Automatisk firmaoppslag på organisasjonsnummer. Brønnøysundregistrene
//  (Enhetsregisteret) er primærkilde for navn/adresse/daglig leder – gratis,
//  offisielt, ingen nøkkel, ingen scraping. Telefonnummer forsøkes hentet fra
//  pluggbare sekundærkilder (1881/Gule Sider/180.no) hvis konfigurert, se
//  src/lib/company-lookup/. Brukes til å autofylle "Ny kunde" og tilbud.
// ============================================================================

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const orgnr = (req.nextUrl.searchParams.get("orgnr") ?? "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(orgnr)) {
    return NextResponse.json(
      { error: "Organisasjonsnummer må være 9 siffer." },
      { status: 400 },
    );
  }

  try {
    const result = await lookupCompany(orgnr);

    return NextResponse.json({
      fields: {
        name: result.name.value ?? "",
        org_number: result.org_number,
        contact_name: result.ceo_name.value ?? "",
        ceo_name: result.ceo_name.value ?? "",
        phone: result.phone.value ?? "",
        city: result.city.value ?? "",
        address: result.address.value ?? "",
        postal_code: result.postal_code.value ?? "",
        industry: result.industry.value ?? "",
      },
      // "Vis kilde": hvilken leverandør hvert felt kom fra (null = ikke funnet).
      sources: {
        name: result.name.source,
        ceo_name: result.ceo_name.source,
        phone: result.phone.source,
        address: result.address.source,
        city: result.city.source,
      },
      notes: result.notes,
    });
  } catch (err) {
    if (err instanceof InvalidOrgNumberError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof CompanyNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const m = err instanceof Error ? err.message : "Ukjent feil";
    return NextResponse.json(
      { error: "Kunne ikke kontakte Brønnøysund: " + m },
      { status: 502 },
    );
  }
}
