import { normalizePhoneNumber } from "@/lib/format";

// ============================================================================
//  1881-logokontroll: sjekker om en bedrift har registrert logo på 1881.no.
//
//  1881 har ikke et bekreftet, offentlig dokumentert API for dette i dag.
//  Adapteren er derfor bygget helt ferdig (matching, normalisering, retry),
//  men det faktiske HTTP-kallet under er en BEST-GUESS-kontrakt som MÅ
//  bekreftes/justeres mot 1881s reelle partner-API før den kan stoles på.
//  Inntil da returnerer denne alltid «not_checked» — ALDRI «not_found» eller
//  «found» uten en reell, bekreftet kilde. Sett API1881_KEY og
//  API1881_BASE_URL når tilgang og endepunkt er avklart.
// ============================================================================

export type Logo1881Status = "found" | "not_found" | "uncertain" | "not_checked";
export type Logo1881MatchMethod = "org_number" | "name_address_phone" | "none";

export interface Logo1881CheckResult {
  status: Logo1881Status;
  match_method: Logo1881MatchMethod;
  message?: string;
  // Om feilen er verdt å prøve igjen (nettverk/5xx) eller endelig.
  transient: boolean;
}

export interface Logo1881CheckInput {
  org_number: string;
  name: string;
  address: string | null;
  phone: string | null;
}

interface Logo1881Candidate {
  org_number: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  has_logo: boolean;
}

export function isLogo1881Configured(): boolean {
  return Boolean(process.env.API1881_KEY && process.env.API1881_BASE_URL);
}

// Fjerner selskapsform-suffikser, diakritiske tegn og skilletegn slik at
// f.eks. "Ole Hansen AS" og "OLE HANSEN A/S" regnes som samme streng.
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function normalizeCompanyNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    // "A/S" er eldre norsk skrivemåte for "AS" — fjern skråstreken (ikke
    // erstatt med mellomrom) FØR selskapsform-suffiksene strippes, slik at
    // begge skrivemåtene normaliseres likt.
    .replace(/\//g, "")
    .replace(/\b(as|asa|da|ans|enk|nuf|sa|ba)\b/g, " ")
    .replace(/[^a-z0-9æøå ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAddressForMatch(address: string | null | undefined): string | null {
  if (!address) return null;
  const normalized = address
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/[^a-z0-9æøå ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

// Matcher primært på organisasjonsnummer. Faller tilbake til normalisert
// navn KOMBINERT med adresse eller telefon — aldri navn alene, siden mange
// norske bedrifter deler navn. Navnetreff uten adresse-/telefonbekreftelse
// gir "usikker match", ikke en antatt bekreftelse.
export function matchLogoCandidate(
  company: { org_number: string; name: string; address: string | null; phone: string | null },
  candidate: Logo1881Candidate,
): { matched: boolean; method: Logo1881MatchMethod; uncertain: boolean } {
  const companyOrg = company.org_number.replace(/\D/g, "");
  const candidateOrg = candidate.org_number?.replace(/\D/g, "") ?? null;
  if (candidateOrg && companyOrg && candidateOrg === companyOrg) {
    return { matched: true, method: "org_number", uncertain: false };
  }

  const nameMatches =
    Boolean(candidate.name) &&
    normalizeCompanyNameForMatch(company.name) === normalizeCompanyNameForMatch(candidate.name);
  if (!nameMatches) {
    return { matched: false, method: "none", uncertain: false };
  }

  const addressMatches =
    Boolean(company.address) &&
    Boolean(candidate.address) &&
    normalizeAddressForMatch(company.address) === normalizeAddressForMatch(candidate.address);
  const phoneMatches =
    Boolean(company.phone) &&
    Boolean(candidate.phone) &&
    normalizePhoneNumber(company.phone) === normalizePhoneNumber(candidate.phone);

  if (addressMatches || phoneMatches) {
    return { matched: true, method: "name_address_phone", uncertain: false };
  }

  // Navnet stemmer, men vi kan ikke bekrefte det med adresse eller telefon.
  // Anta ALDRI at like navn er samme bedrift — merk som usikker i stedet.
  return { matched: false, method: "name_address_phone", uncertain: true };
}

export async function check1881Logo(company: Logo1881CheckInput): Promise<Logo1881CheckResult> {
  const key = process.env.API1881_KEY;
  const baseUrl = process.env.API1881_BASE_URL;

  if (!key) {
    return {
      status: "not_checked",
      match_method: "none",
      message: "Krever datakildetilgang: mangler API1881_KEY.",
      transient: false,
    };
  }
  if (!baseUrl) {
    return {
      status: "not_checked",
      match_method: "none",
      message:
        "Krever datakildetilgang: mangler bekreftet 1881-endepunkt (sett API1881_BASE_URL når 1881s partner-API er bekreftet).",
      transient: false,
    };
  }

  // AbortController + clearTimeout (i stedet for AbortSignal.timeout) slik at
  // ikke en 6-sekunders nedtelling henger igjen etter at svaret er mottatt.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `${baseUrl.replace(/\/$/, "")}/companies/${encodeURIComponent(company.org_number)}`,
      {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: controller.signal,
      },
    );

    if (res.status === 404) {
      return { status: "not_found", match_method: "org_number", transient: false };
    }
    if (!res.ok) {
      return {
        status: "not_checked",
        match_method: "none",
        message: `1881 svarte ${res.status}.`,
        transient: res.status >= 500,
      };
    }

    const data = (await res.json()) as Partial<Logo1881Candidate> & {
      orgNumber?: string;
      hasLogo?: boolean;
    };
    const candidate: Logo1881Candidate = {
      org_number: data.org_number ?? data.orgNumber ?? null,
      name: data.name ?? "",
      address: data.address ?? null,
      phone: data.phone ?? null,
      has_logo: Boolean(data.has_logo ?? data.hasLogo),
    };

    const match = matchLogoCandidate(company, candidate);
    if (match.uncertain) {
      return { status: "uncertain", match_method: match.method, transient: false };
    }
    if (!match.matched) {
      return { status: "not_found", match_method: "none", transient: false };
    }
    return {
      status: candidate.has_logo ? "found" : "not_found",
      match_method: match.method,
      transient: false,
    };
  } catch (error) {
    return {
      status: "not_checked",
      match_method: "none",
      message: error instanceof Error ? error.message : "Kunne ikke kontakte 1881.",
      transient: true,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
