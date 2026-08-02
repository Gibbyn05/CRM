import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  B2B_NACE_CODES,
  BrregEntity,
  guessNaceCode,
  isRelevantBusiness,
  normalizeBrregEntity,
  normalizeFinancials,
  ReachrCompany,
} from "@/lib/reachr";
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
    const takenOrgNumbers = await getTakenOrgNumbers(supabase);
    let results = (data._embedded?.enheter ?? [])
      .filter(isRelevantBusiness)
      .map(normalizeBrregEntity)
      .filter((company) => !takenOrgNumbers.has(company.org_number))
      .filter((company) => (hasEmail ? Boolean(company.email) : true))
      .filter((company) => (hasWebsite ? Boolean(company.website) : true));

    if (minRevenue != null || maxRevenue != null || minResult != null) {
      results = await filterByFinancials(results, { minRevenue, maxRevenue, minResult });
    }

    return NextResponse.json({
      results: results.slice(0, size),
      total: data.page?.totalElements ?? results.length,
      page,
      has_more: results.length > size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return NextResponse.json(
      { error: `Kunne ikke hente leads: ${message}` },
      { status: 502 },
    );
  }
}

async function getTakenOrgNumbers(
  supabase: ReturnType<typeof createClient>,
): Promise<Set<string>> {
  const client = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const [leadRows, customerRows] = await Promise.all([
    client.from("reachr_leads").select("org_number"),
    client.from("customers").select("org_number").not("org_number", "is", null),
  ]);

  const values = [
    ...((leadRows.data as { org_number: string | null }[] | null) ?? []),
    ...((customerRows.data as { org_number: string | null }[] | null) ?? []),
  ];

  return new Set(
    values
      .map((row) => row.org_number?.replace(/\s/g, ""))
      .filter((org): org is string => Boolean(org)),
  );
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
