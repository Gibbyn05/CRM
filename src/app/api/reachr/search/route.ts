import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  B2B_NACE_CODES,
  BrregEntity,
  guessNaceCode,
  isRelevantBusiness,
  mergeReachrCompany,
  normalizeBrregEntity,
  normalizeFinancials,
  ReachrCompany,
} from "@/lib/reachr";
import { searchAdditionalProviders } from "@/lib/reachr/providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "reachr:search",
    limit: 45,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const query = (sp.get("q") ?? "").trim();

  // Direkte oppslag på organisasjonsnummer (9 sifre, uansett mellomrom):
  // hent bedriften rett fra Brønnøysund og hopp over ALLE filtre (B2B-kode,
  // ansatte, «allerede tatt» osv.). Da finner man alltid en spesifikk bedrift
  // – f.eks. i en demo – selv om den allerede er kunde.
  const orgQuery = query.replace(/\D/g, "");
  if (/^\d{9}$/.test(orgQuery)) {
    return lookupByOrgNumber(orgQuery, supabase);
  }

  const location = (sp.get("location") ?? "").trim();
  const industry = (sp.get("industry") ?? "").trim();
  const nace = (sp.get("nace") ?? "").trim();
  const employees = sp.get("employees") ?? "all";
  const mva = sp.get("mva") === "true";
  const orgForm = (sp.get("orgForm") ?? "").trim().toUpperCase();
  const foundedFrom = (sp.get("foundedFrom") ?? "").trim();
  const foundedTo = (sp.get("foundedTo") ?? "").trim();
  const minRevenue = parseNumber(sp.get("minRevenue"));
  const maxRevenue = parseNumber(sp.get("maxRevenue"));
  const minResult = parseNumber(sp.get("minResult"));
  const hasEmail = sp.get("hasEmail") === "true";
  const hasWebsite = sp.get("hasWebsite") === "true";
  const page = Math.max(0, parseInt(sp.get("page") ?? "0", 10) || 0);
  const size = Math.min(100, Math.max(10, parseInt(sp.get("size") ?? "50", 10) || 50));

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("size", String(Math.min(size + 75, 200)));
  params.set("konkurs", "false");
  if (query) params.set("navn", query);
  if (location) params.set("forretningsadresse.poststed", location.toUpperCase());
  if (mva) params.set("registrertIMvaregisteret", "true");
  if (orgForm) params.set("organisasjonsform", orgForm);
  if (foundedFrom) params.set("fraStiftelsesdato", foundedFrom);
  if (foundedTo) params.set("tilStiftelsesdato", foundedTo);

  const guessedNace = industry ? guessNaceCode(industry) : null;
  const selectedNace = nace || guessedNace;
  if (selectedNace === "B2B") {
    B2B_NACE_CODES.forEach((code) => params.append("naeringskode", code));
  } else if (selectedNace) {
    params.set("naeringskode", selectedNace);
  } else if (industry) {
    params.set("navn", industry);
  }

  const [fromEmployees, toEmployees] = employeesRange(employees);
  if (fromEmployees) params.set("fraAntallAnsatte", fromEmployees);
  if (toEmployees) params.set("tilAntallAnsatte", toEmployees);

  try {
    const res = await fetch(
      `https://data.brreg.no/enhetsregisteret/api/enheter?${params}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 120 } },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "Brønnøysund svarte ikke akkurat nå.", status: res.status },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      _embedded?: { enheter?: BrregEntity[] };
      page?: { totalElements?: number };
    };
    const takenMap = await getTakenOrgNumbers(supabase);
    let results = (data._embedded?.enheter ?? [])
      .filter(isRelevantBusiness)
      .map(normalizeBrregEntity);

    const external = await searchAdditionalProviders({
      query,
      location,
      industry,
      nace: selectedNace ?? nace,
      page,
      size,
    });
    results = mergeCompanies(results, external.companies)
      .filter((company) => (hasEmail ? Boolean(company.email) : true))
      .filter((company) => (hasWebsite ? Boolean(company.website) : true));

    // «Allerede i CRM»: ved et navnesøk vil man som regel lete etter en konkret
    // bedrift – da viser vi den med et merke i stedet for å skjule den. Ved rent
    // filter-/bransjesøk (prospektering) skjuler vi tatte bedrifter som før.
    if (query) {
      results = results.map((company) => {
        const inCrm = takenMap.get(company.org_number);
        return inCrm ? { ...company, in_crm: inCrm } : company;
      });
    } else {
      results = results.filter((company) => !takenMap.has(company.org_number));
    }

    if (minRevenue != null || maxRevenue != null || minResult != null) {
      results = await filterByFinancials(results, { minRevenue, maxRevenue, minResult });
    }

    return NextResponse.json({
      results: results.slice(0, size),
      total: data.page?.totalElements ?? results.length,
      page,
      has_more: results.length > size,
      sources: external.sources,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return NextResponse.json(
      { error: `Kunne ikke hente leads: ${message}` },
      { status: 502 },
    );
  }
}

// Slår opp én bedrift direkte via organisasjonsnummer. Returnerer den uansett
// bransje/ansatte/status og uten «allerede tatt»-filteret, slik at en konkret
// bedrift alltid kan hentes fram (verifisering, demo, gjenåpning).
async function lookupByOrgNumber(
  orgNumber: string,
  supabase: ReturnType<typeof createClient>,
) {
  try {
    const res = await fetch(
      `https://data.brreg.no/enhetsregisteret/api/enheter/${orgNumber}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 120 } },
    );
    if (res.status === 404) {
      return NextResponse.json({
        results: [],
        total: 0,
        page: 0,
        has_more: false,
        sources: [],
      });
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: "Brønnøysund svarte ikke akkurat nå.", status: res.status },
        { status: 502 },
      );
    }
    const entity = (await res.json()) as BrregEntity;
    const company = normalizeBrregEntity(entity);
    const inCrm = (await getTakenOrgNumbers(supabase)).get(company.org_number);
    if (inCrm) company.in_crm = inCrm;
    return NextResponse.json({
      results: [company],
      total: 1,
      page: 0,
      has_more: false,
      sources: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return NextResponse.json(
      { error: `Kunne ikke hente bedrift: ${message}` },
      { status: 502 },
    );
  }
}

function mergeCompanies(primary: ReachrCompany[], extra: ReachrCompany[]): ReachrCompany[] {
  const map = new Map<string, ReachrCompany>();
  for (const company of [...primary, ...extra]) {
    if (!company.org_number) continue;
    const existing = map.get(company.org_number);
    map.set(
      company.org_number,
      existing ? mergeReachrCompany(existing, company) : company,
    );
  }
  return [...map.values()];
}

async function getTakenOrgNumbers(
  supabase: ReturnType<typeof createClient>,
): Promise<Map<string, "customer" | "lead">> {
  const client = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const [leadRows, customerRows] = await Promise.all([
    client.from("reachr_leads").select("org_number"),
    client.from("customers").select("org_number").not("org_number", "is", null),
  ]);

  const map = new Map<string, "customer" | "lead">();
  const norm = (v: string | null) => v?.replace(/\D/g, "") || null;
  // Leads først, deretter kunder – kunde «vinner» hvis begge finnes.
  for (const row of (leadRows.data as { org_number: string | null }[] | null) ?? []) {
    const org = norm(row.org_number);
    if (org) map.set(org, "lead");
  }
  for (const row of (customerRows.data as { org_number: string | null }[] | null) ?? []) {
    const org = norm(row.org_number);
    if (org) map.set(org, "customer");
  }
  return map;
}

function parseNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/\s/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function employeesRange(value: string): [string | null, string | null] {
  if (value === "1-10") return ["1", "10"];
  if (value === "11-50") return ["11", "50"];
  if (value === "51-200") return ["51", "200"];
  if (value === "200+") return ["200", "99999"];
  return [null, null];
}

async function filterByFinancials(
  companies: ReachrCompany[],
  filters: { minRevenue: number | null; maxRevenue: number | null; minResult: number | null },
): Promise<ReachrCompany[]> {
  const enriched = await Promise.all(
    companies.slice(0, 40).map(async (company) => {
      try {
        const res = await fetch(
          `https://data.brreg.no/regnskapsregisteret/regnskap/${company.org_number}`,
          { headers: { Accept: "application/json" }, next: { revalidate: 86400 } },
        );
        if (!res.ok) return { ...company, financials: null };
        return { ...company, financials: normalizeFinancials(await res.json()) };
      } catch {
        return { ...company, financials: null };
      }
    }),
  );

  return enriched.filter((company) => {
    const financials = company.financials;
    if (!financials) return false;
    if (filters.minRevenue != null && (financials.revenue ?? -Infinity) < filters.minRevenue) return false;
    if (filters.maxRevenue != null && (financials.revenue ?? Infinity) > filters.maxRevenue) return false;
    if (filters.minResult != null && (financials.annual_result ?? -Infinity) < filters.minResult) return false;
    return true;
  });
}
