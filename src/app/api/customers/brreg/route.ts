import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  CompanyNotFoundError,
  InvalidOrgNumberError,
  lookupCompany,
} from "@/lib/company-lookup";

// ============================================================================
//  Automatisk firmaoppslag på organisasjonsnummer for "Ny kunde"-flyten.
//
//  Brønnøysundregistrene (Enhetsregisteret) er primærkilde for navn/adresse/
//  daglig leder – gratis, offisielt, ingen nøkkel, ingen scraping.
//  Telefonnummer forsøkes hentet fra pluggbare, konfigurerbare
//  sekundærkilder (1881/Gule Sider/180.no) hvis satt opp, se
//  src/lib/company-lookup/. Manglende data feiler aldri kallet – det gis
//  som tydelige `notes` slik at brukeren ser hva som ikke ble funnet.
//
//  I tillegg sjekkes om org.nr allerede er registrert som kunde i egen
//  database, slik at "Ny kunde"-flyten kan skille et rent registertreff fra
//  en kunde som allerede finnes og unngå utilsiktede duplikater. Dette
//  slår bevisst opp på tvers av RLS (service-role) – duplikatvarsel skal
//  gjelde hele kundebasen, ikke bare det innlogget selger selv ser.
// ============================================================================

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
    const [result, existingCustomer] = await Promise.all([
      lookupCompany(orgnr),
      findExistingCustomer(orgnr),
    ]);

    return NextResponse.json({
      fields: {
        name: result.name.value ?? "",
        org_number: result.org_number,
        org_form: result.org_form.value ?? "",
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
      flags: result.flags,
      notes: result.notes,
      // Skiller eksternt registertreff fra en kunde som allerede er lagret.
      existingCustomer,
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
      { error: "Kunne ikke kontakte Brønnøysund akkurat nå: " + m },
      { status: 502 },
    );
  }
}

interface ExistingCustomerHit {
  id: string;
  name: string;
  city: string | null;
  owner_name: string | null;
  created_at: string;
}

async function findExistingCustomer(orgnr: string): Promise<ExistingCustomerHit | null> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("customers")
    .select("id, name, city, owner_id, created_at")
    .eq("org_number", orgnr)
    .maybeSingle();
  if (!existing) return null;

  let ownerName: string | null = null;
  if (existing.owner_id) {
    const { data: owner } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", existing.owner_id)
      .maybeSingle();
    ownerName = owner?.full_name ?? null;
  }

  return {
    id: existing.id,
    name: existing.name,
    city: existing.city,
    owner_name: ownerName,
    created_at: existing.created_at,
  };
}
