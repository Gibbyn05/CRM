import type { ReachrCompany } from "@/lib/reachr";
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
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

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
    const keywords = await scrape1881Keywords(orgNumber);
    if (keywords.length) {
      enrichment.keywords = keywords;
      fields.push(`${keywords.length} søkeord`);
    }

    // 2) Telefon via betalt API (kun hvis nøkkel satt og nummer mangler).
    if (process.env.API1881_KEY && !currentCompany?.phone) {
      const phone = await lookupPhoneViaApi(orgNumber);
      if (phone) {
        enrichment.phone = phone;
        fields.push("telefon");
      }
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

// Henter registrerte søkeord fra den offentlige 1881-profilen. Søkeordene ligger
// som «emneknagger»-lenker under en «Søkeord»-seksjon. Ingen søkeord = ikke en
// aktiv annonsør.
async function scrape1881Keywords(orgNumber: string): Promise<string[]> {
  try {
    const res = await fetch(`https://www.1881.no/?query=${orgNumber}`, {
      headers: { Accept: "text/html", "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Bare søkeord bruker /emneknagger/-lenker (bransjekategoriene bruker andre).
    const matches = [...html.matchAll(/\/emneknagger\/[^"]+">([^<]+)<\/a>/gi)];
    const seen = new Set<string>();
    const keywords: string[] = [];
    for (const m of matches) {
      const kw = decodeEntities(m[1]).trim();
      const key = kw.toLowerCase();
      if (kw && !seen.has(key)) {
        seen.add(key);
        keywords.push(kw);
      }
      if (keywords.length >= 40) break;
    }
    return keywords;
  } catch {
    return [];
  }
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

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&aring;/gi, "å")
    .replace(/&oslash;/gi, "ø")
    .replace(/&aelig;/gi, "æ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
