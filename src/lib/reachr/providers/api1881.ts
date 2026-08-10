import type { ReachrCompany, ReachrContactCandidate } from "@/lib/reachr";
import { fetch1881Profile } from "../keywords1881";
import type { ReachrProvider, ReachrProviderResult } from "./types";

// ============================================================================
//  1881-kilde.
//
//  1) SØKEORD (gratis): leser bedriftens offentlige 1881-profil og henter de
//     registrerte søkeordene («emneknagger»). At en bedrift HAR søkeord betyr
//     at den er en aktiv 1881-annonsør – et nyttig kvalifiseringssignal.
//  2) TELEFON (betalt): hvis API1881_KEY er satt, slås telefon opp via det
//     offisielle API-et (services.api1881.no) når nummer mangler.
//
//  Kjøres kun ved eksplisitt («dyp») berikelse – ikke på hele trefflista.
// ============================================================================

const HOST = (process.env.API1881_HOST || "https://services.api1881.no").replace(
  /\/$/,
  "",
);

export const api1881Provider: ReachrProvider = {
  name: "api1881",
  label: "1881",
  isConfigured() {
    // Alltid «konfigurert»: søkeord-skrapingen er gratis. Telefon-API-et krever
    // egen nøkkel, men det håndteres inne i enrichByOrgNumber.
    return true;
  },
  async enrichByOrgNumber(
    orgNumber: string,
    currentCompany?: ReachrCompany | null,
  ): Promise<ReachrProviderResult> {
    const enrichment: Partial<ReachrCompany> = {};
    const fields: string[] = [];

    // 1) Søkeord fra offentlig profil (gratis).
    const profile = await fetch1881Profile(orgNumber);
    const keywords = profile.keywords;
    if (keywords.length) {
      enrichment.keywords = keywords;
      fields.push(`${keywords.length} søkeord`);
    }

    // 2) Bruk offentlig profil først. Betalt API er kun reserve.
    const existingCandidate = currentCompany?.contact_candidates?.some(
      (candidate) => candidate.subject === "company",
    );
    const phone = profile.phone ?? (
      process.env.API1881_KEY && !existingCandidate
        ? await lookupPhoneViaApi(orgNumber)
        : null
    );
    if (phone) {
      enrichment.phone = phone;
      enrichment.contact_candidates = [companyCandidate(
        phone,
        orgNumber,
        currentCompany,
        profile.phone ? "1881 offentlig profil" : "1881 API",
      )];
      fields.push(profile.phone ? "telefon (offentlig profil)" : "telefon (API)");
    }

    return {
      company: Object.keys(enrichment).length ? enrichment : undefined,
      source: {
        provider: "api1881",
        label: "1881",
        enabled: true,
        fields,
        status: "active",
        message: fields.length ? undefined : "Ingen 1881-søkeord funnet.",
      },
    };
  },
};

function companyCandidate(
  phone: string,
  orgNumber: string,
  company: ReachrCompany | null | undefined,
  providerLabel: string,
): ReachrContactCandidate {
  return {
    phone,
    subject: "company",
    priority: "company_main",
    person_name: null,
    role_code: null,
    role_name: null,
    company_name: company?.name ?? null,
    org_number: orgNumber,
    postal_code: company?.address.postal_code ?? null,
    provider: "api1881",
    provider_label: providerLabel,
    source_context: "org_number_lookup",
    verified: false,
    confidence: 0,
    matched_fields: [],
  };
}

// Telefonoppslag via det offisielle (betalte) 1881-API-et.
async function lookupPhoneViaApi(orgNumber: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${HOST}/lookup/orgnumber/${encodeURIComponent(orgNumber)}`,
      {
        headers: {
          "Ocp-Apim-Subscription-Key": process.env.API1881_KEY!,
          Accept: "application/json",
        },
        next: { revalidate: 86400 },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { contacts?: unknown[] };
    const contact = Array.isArray(data.contacts) ? data.contacts[0] : null;
    if (!contact) return null;
    for (const s of collectStrings(contact)) {
      const p = toNorwegianPhone(s);
      if (p && p.replace("+47", "") !== orgNumber) return p;
    }
    return null;
  } catch {
    return null;
  }
}

function collectStrings(node: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6 || node == null) return out;
  if (typeof node === "string") {
    const t = node.trim();
    if (t) out.push(t);
  } else if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, out, depth + 1);
  } else if (typeof node === "object") {
    for (const value of Object.values(node)) collectStrings(value, out, depth + 1);
  }
  return out;
}

function toNorwegianPhone(value: string): string | null {
  const d = value.replace(/[^\d+]/g, "");
  const p = d.startsWith("0047")
    ? `+47${d.slice(4)}`
    : d.startsWith("+47")
      ? d
      : d.length === 8
        ? `+47${d}`
        : d;
  if (!/^\+47\d{8}$/.test(p)) return null;
  if (/^(\+47)?0{8}$/.test(p)) return null;
  return p;
}
