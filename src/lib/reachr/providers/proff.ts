import {
  ReachrCompany,
  ReachrContactCandidate,
  ReachrFinancials,
  ReachrRole,
  capitalizeWords,
  normalizeUrl,
} from "@/lib/reachr";
import type { ReachrProvider, ReachrProviderResult, ReachrSearchInput } from "./types";

const BASE_URL = "https://api.proff.no";

export const proffProvider: ReachrProvider = {
  name: "proff",
  label: "Proff API",
  isConfigured() {
    return Boolean(process.env.PROFF_API_TOKEN);
  },
  async enrichByOrgNumber(
    orgNumber: string,
    currentCompany?: ReachrCompany | null,
  ): Promise<ReachrProviderResult> {
    // Uten offisiell API-nøkkel: skrap Proffs offentlige firmakort for
    // telefon/e-post/nettside (gratis). Med PROFF_API_TOKEN brukes API-et.
    if (!this.isConfigured()) {
      if (currentCompany?.phone) {
        return { source: source("active", [], "Hoppet over – telefon allerede funnet.") };
      }
      return scrapeProffCard(orgNumber, currentCompany);
    }

    try {
      const [registerRes, ownerRes, eniroRes] = await Promise.all([
        proffFetch(`/companies/register/NO/${orgNumber}`),
        proffFetch(`/companies/owner/NO/${orgNumber}`),
        proffFetch(`/companies/eniropro/NO?industry=${encodeURIComponent(orgNumber)}&pageSize=5&expand=true`),
      ]);

      const register = registerRes.ok ? await registerRes.json() : null;
      const owners = ownerRes.ok ? await ownerRes.json() : null;
      const eniro = eniroRes.ok ? await eniroRes.json() : null;

      return {
        company: normalizeProff(register, owners, eniro, orgNumber),
        source: source("active", [
          "proff-register",
          "telefon",
          "nettside",
          "regnskap",
          "roller/eiere",
          "eniropro",
        ]),
      };
    } catch (error) {
      return {
        source: source(
          "error",
          [],
          error instanceof Error ? error.message : "Proff-oppslag feilet.",
        ),
      };
    }
  },
  async search(input: ReachrSearchInput): Promise<ReachrProviderResult> {
    if (!this.isConfigured()) {
      return { companies: [], source: source("not_configured", [], "Mangler PROFF_API_TOKEN.") };
    }
    const params = new URLSearchParams({
      pageSize: String(Math.min(input.size, 100)),
      pageNumber: String(input.page + 1),
      filter: "status:AKTIVT",
    });
    if (input.query) params.set("query", input.query);
    if (input.nace && input.nace !== "B2B") params.set("industryCode", input.nace);
    if (input.industry && !input.nace) params.set("query", input.industry);

    try {
      const res = await proffFetch(`/companies/register/NO?${params}`);
      if (!res.ok) return { companies: [], source: source("error", [], `Proff svarte ${res.status}.`) };
      const data = await res.json();
      const rows = findArray(data, ["companies", "items", "results", "data"]);
      return {
        companies: rows
          .map((row) => normalizeProff(row, null, null))
          .filter(isUsableCompany),
        source: source("active", ["registersøk", "regnskap", "telefon"]),
      };
    } catch (error) {
      return {
        companies: [],
        source: source("error", [], error instanceof Error ? error.message : "Proff-søk feilet."),
      };
    }
  },
};

// Skraper Proffs offentlige firmakort (https://www.proff.no/company/{orgnr},
// som redirecter til selve siden) og henter kontaktinfo fra HTML-en. Gratis,
// men best-effort – Proff kan endre markup.
async function scrapeProffCard(
  orgNumber: string,
  currentCompany?: ReachrCompany | null,
): Promise<ReachrProviderResult> {
  try {
    const res = await fetch(`https://www.proff.no/company/${orgNumber}`, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      return { source: source("error", [], `Proff svarte ${res.status}.`) };
    }
    const html = await res.text();

    // Telefon: «"phone":"75007509"» eller «phone_click">75 00 75 09».
    const phoneRaw =
      html.match(/"phone(?:Number)?":"(\+?\d[\d\s]{6,})"/i)?.[1] ??
      html.match(/phone_click"[^>]*>([\d\s]{8,})/i)?.[1] ??
      html.match(/tel:(\+?\d[\d\s]{6,})/i)?.[1] ??
      null;
    const phone = phoneRaw ? toNorwegianPhone(phoneRaw, orgNumber) : null;

    const emailRaw = html.match(/"email":"([^"@\s]+@[^"\s]+)"/i)?.[1] ?? null;
    const email = emailRaw && /^[^@]+@[^@]+\.[a-z]{2,}$/i.test(emailRaw) ? emailRaw.toLowerCase() : null;

    const websiteRaw =
      html.match(/"(?:homePage|webAddress|homepage|website)":"(https?:\/\/[^"\s]+)"/i)?.[1] ?? null;
    const website = normalizeUrl(websiteRaw);

    const enrichment: Partial<ReachrCompany> = {};
    if (phone) {
      enrichment.phone = phone;
      enrichment.contact_candidates = [{
        phone,
        subject: "company",
        priority: "company_main",
        person_name: null,
        role_code: null,
        role_name: null,
        company_name: currentCompany?.name ?? null,
        org_number: orgNumber,
        postal_code: currentCompany?.address.postal_code ?? null,
        provider: "proff",
        provider_label: "Proff",
        source_context: "org_number_lookup",
        verified: false,
        confidence: 0,
        matched_fields: [],
      }];
    }
    if (email) enrichment.email = email;
    if (website) enrichment.website = website;

    const fields = [
      phone ? "telefon" : null,
      email ? "e-post" : null,
      website ? "nettside" : null,
    ].filter((f): f is string => Boolean(f));

    return {
      company: Object.keys(enrichment).length ? enrichment : undefined,
      source: source(
        "active",
        fields,
        fields.length ? undefined : "Proff-kortet ble lest, men uten tydelig telefon.",
      ),
    };
  } catch (error) {
    return {
      source: source(
        "error",
        [],
        error instanceof Error ? error.message : "Proff-skrap feilet.",
      ),
    };
  }
}

// Normaliser til +47XXXXXXXX hvis det ser ut som et norsk telefonnummer.
function toNorwegianPhone(value: string, orgNumber: string): string | null {
  const d = value.replace(/[^\d+]/g, "");
  const p = d.startsWith("0047")
    ? `+47${d.slice(4)}`
    : d.startsWith("+47")
      ? d
      : d.length === 8
        ? `+47${d}`
        : d;
  if (!/^\+47\d{8}$/.test(p)) return null;
  if (p.replace("+47", "") === orgNumber) return null;
  return p;
}

async function proffFetch(path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Token ${process.env.PROFF_API_TOKEN}`,
    },
    next: { revalidate: 86400 },
  });
}

function normalizeProff(
  register: unknown,
  owners: unknown,
  eniro: unknown,
  lookupOrgNumber?: string,
): Partial<ReachrCompany> {
  const row = asRecord(register);
  const eniroRow = findArray(eniro, ["companies", "items", "results", "data"])[0] ?? asRecord(eniro);
  const orgNumber =
    firstString(row, ["organisationNumber", "organizationNumber", "orgNumber", "businessId", "companyNumber"]) ??
    lookupOrgNumber ??
    null;
  const name = firstString(row, ["name", "companyName", "officialName"]) ?? firstString(eniroRow, ["name", "companyName"]);
  const address = asRecord(firstValue(row, ["businessAddress", "postalAddress", "visitingAddress", "address"]));
  const accounts = asRecord(firstValue(row, ["companyAccounts", "annualAccounts", "accounts", "financials"]));

  const companyPhone =
    firstString(row, ["phone", "phoneNumber", "telephone"]) ??
    firstString(eniroRow, ["phone", "phoneNumber", "telephone"]);
  const contactCandidates = lookupOrgNumber
    ? normalizeProffContacts(row, owners, eniroRow, {
        orgNumber: lookupOrgNumber,
        companyName: name,
        companyPhone,
      })
    : [];

  return {
    org_number: orgNumber?.replace(/\D/g, "") ?? "",
    name: capitalizeWords(name),
    organization_form_code: firstString(row, ["companyType", "organisationFormCode", "organizationFormCode"]) ?? null,
    organization_form: firstString(row, ["companyTypeName", "organisationForm", "organizationForm"]) ?? null,
    industry_code: firstString(row, ["naceCode", "industryCode", "primaryIndustryCode"]) ?? null,
    industry: firstString(row, ["naceText", "industry", "primaryIndustry"]) ?? null,
    employees: firstNumber(row, ["numberOfEmployees", "numEmployees", "employees"]),
    website: normalizeUrl(firstString(row, ["homepage", "website", "webAddress"]) ?? firstString(eniroRow, ["homepage", "website", "url"])),
    email: firstString(row, ["email", "emailAddress"]) ?? firstString(eniroRow, ["email", "emailAddress"]) ?? null,
    phone: companyPhone ?? null,
    founded_at: firstString(row, ["establishedDate", "foundationDate", "foundedDate"]) ?? null,
    address: {
      address: firstString(address, ["addressLine", "streetAddress", "street"]) ?? null,
      postal_code: firstString(address, ["postCode", "postalCode", "zipCode"]) ?? null,
      city: capitalizeWords(firstString(address, ["postPlace", "city", "postalArea"])),
      municipality: capitalizeWords(firstString(row, ["municipality", "municipalityName"])),
    },
    financials: normalizeProffFinancials(accounts),
    roles: normalizeProffRoles(row, owners),
    contact_candidates: contactCandidates,
    data_sources: [],
  };
}

function normalizeProffContacts(
  register: Record<string, unknown> | null,
  owners: unknown,
  eniroRow: Record<string, unknown> | null,
  company: { orgNumber: string; companyName: string | null; companyPhone: string | null },
): ReachrContactCandidate[] {
  const candidates: ReachrContactCandidate[] = [];
  if (company.companyPhone) {
    candidates.push({
      phone: company.companyPhone,
      subject: "company",
      priority: "company_main",
      person_name: null,
      role_code: null,
      role_name: null,
      company_name: company.companyName,
      org_number: company.orgNumber,
      postal_code: null,
      provider: "proff",
      provider_label: "Proff / EniroPro",
      source_context: "org_number_lookup",
      verified: false,
      confidence: 0,
      matched_fields: [],
    });
  }

  const personRows = [
    ...findArray(register, ["roles", "boardMembers", "management"]),
    ...findArray(owners, ["owners", "realOwners", "persons", "items"]),
    ...findArray(eniroRow, ["contacts", "persons", "employees"]),
  ];
  for (const person of personRows) {
    const phone = firstString(person, ["phone", "phoneNumber", "mobile", "mobilePhone", "telephone"]);
    const personName = firstString(person, ["name", "fullName", "personName"]);
    const roleCode = firstString(person, ["roleCode", "role", "type"]);
    const roleName = firstString(person, ["roleDescription", "roleName", "title", "position", "type"]);
    if (!phone || !personName || !isPriorityRole(roleCode, roleName)) continue;
    candidates.push({
      phone,
      subject: "person",
      priority: priorityFromRole(roleCode, roleName),
      person_name: capitalizeWords(personName),
      role_code: roleCode,
      role_name: roleName,
      company_name:
        firstString(person, ["companyName", "employer", "businessName"]) ?? company.companyName,
      org_number:
        firstString(person, ["organisationNumber", "organizationNumber", "orgNumber", "companyNumber"]) ??
        company.orgNumber,
      postal_code: firstString(person, ["postCode", "postalCode", "zipCode"]),
      provider: "proff",
      provider_label: "Proff / EniroPro",
      source_context: "org_number_lookup",
      verified: false,
      confidence: 0,
      matched_fields: [],
    });
  }
  return candidates;
}

function isPriorityRole(code: string | null, name: string | null): boolean {
  return priorityFromRole(code, name) !== "company_main";
}

function priorityFromRole(
  code: string | null,
  name: string | null,
): "daily_manager" | "chairperson" | "company_main" {
  const value = `${code ?? ""} ${name ?? ""}`.toLocaleLowerCase("nb-NO");
  if (/\bdagl\b|daglig leder/.test(value)) return "daily_manager";
  if (/\blede\b|styreleder/.test(value)) return "chairperson";
  return "company_main";
}

function isUsableCompany(company: Partial<ReachrCompany>): company is ReachrCompany {
  return Boolean(company.org_number && company.name && company.address);
}

function normalizeProffFinancials(row: Record<string, unknown> | null): ReachrFinancials | null {
  if (!row) return null;
  return {
    year: firstString(row, ["year", "accountingYear", "fiscalYear"]) ?? null,
    revenue: firstNumber(row, ["operatingRevenue", "revenue", "turnover"]),
    operating_result: firstNumber(row, ["operatingResult", "operatingProfit"]),
    annual_result: firstNumber(row, ["annualResult", "profit", "result"]),
    equity: firstNumber(row, ["equity"]),
    assets: firstNumber(row, ["totalAssets", "assets"]),
    debt: firstNumber(row, ["debt", "totalDebt"]),
  };
}

function normalizeProffRoles(register: Record<string, unknown> | null, owners: unknown): ReachrRole[] {
  const rows = [
    ...findArray(register, ["roles", "boardMembers", "management"]),
    ...findArray(owners, ["owners", "realOwners", "persons", "items"]),
  ];
  return rows
    .map((row) => ({
      role_code: firstString(row, ["roleCode", "type", "role"]) ?? "PROFF",
      role_name: firstString(row, ["roleDescription", "roleName", "type"]) ?? "Proff rolle",
      name: capitalizeWords(firstString(row, ["name", "fullName", "personName"])),
    }))
    .filter((role) => role.name);
}

function source(
  status: "active" | "not_configured" | "error",
  fields: string[],
  message?: string,
) {
  return {
    provider: "proff",
    label: "Proff API",
    enabled: status === "active",
    fields,
    status,
    message,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstValue(row: Record<string, unknown> | null, keys: string[]): unknown {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (value != null) return value;
  }
  return null;
}

function firstString(row: Record<string, unknown> | null, keys: string[]): string | null {
  const value = firstValue(row, keys);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstNumber(row: Record<string, unknown> | null, keys: string[]): number | null {
  const value = firstValue(row, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function findArray(source: unknown, keys: string[]): Record<string, unknown>[] {
  const direct = asRecord(source);
  if (!direct) return [];
  for (const key of keys) {
    const value = direct[key];
    if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }
  for (const value of Object.values(direct)) {
    if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    const nested = findArray(value, keys);
    if (nested.length) return nested;
  }
  return [];
}
