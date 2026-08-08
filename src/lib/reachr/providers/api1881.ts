import type { ReachrCompany } from "@/lib/reachr";
import type { ReachrProvider, ReachrProviderResult } from "./types";

// ============================================================================
//  1881 «Opplysningen Search API» (services.api1881.no).
//
//  Slår opp bedriftens kontaktinfo (telefon/e-post/nettside) via
//  GET /lookup/orgnumber/{orgnr}. Dette er et BETALT API – hvert oppslag
//  koster – så det kalles kun ved eksplisitt firmaoppslag (drawer/lagring),
//  ikke ved bulk-berikelse i søkelista, og hoppes over hvis vi allerede har
//  telefon fra en gratis kilde.
//
//  Konfig (Vercel → Environment Variables):
//    API1881_KEY   – abonnementsnøkkel (Ocp-Apim-Subscription-Key) fra din
//                    1881-profil. Uten den er kilden «ikke aktiv».
//    API1881_HOST  – valgfritt, default https://services.api1881.no
// ============================================================================

const HOST = (process.env.API1881_HOST || "https://services.api1881.no").replace(
  /\/$/,
  "",
);

export const api1881Provider: ReachrProvider = {
  name: "api1881",
  label: "1881",
  isConfigured() {
    return Boolean(process.env.API1881_KEY);
  },
  async enrichByOrgNumber(
    orgNumber: string,
    currentCompany?: ReachrCompany | null,
  ): Promise<ReachrProviderResult> {
    if (!this.isConfigured()) {
      return {
        source: src("not_configured", [], "Mangler API1881_KEY."),
      };
    }

    // Spar penger: har vi allerede telefon fra en gratis kilde, dropp oppslaget.
    if (currentCompany?.phone) {
      return {
        source: src("active", [], "Hoppet over – telefon allerede funnet gratis."),
      };
    }

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
      if (!res.ok) {
        return {
          source: src("error", [], `1881 svarte ${res.status}.`),
        };
      }

      const data = (await res.json()) as { contacts?: unknown[] };
      const contact = Array.isArray(data.contacts) ? data.contacts[0] : null;
      if (!contact) {
        return { source: src("active", [], "Ingen treff i 1881.") };
      }

      // Samle alle strenger i kontakten og plukk ut telefon/e-post/nettside.
      const strings = collectStrings(contact);
      const phone = strings.map(toNorwegianPhone).find((p): p is string =>
        Boolean(p) && p!.replace("+47", "") !== orgNumber,
      );
      const email = strings
        .map((s) => s.toLowerCase())
        .find((s) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s));
      const website = strings.find((s) => /^https?:\/\/\S+$/i.test(s));

      const enrichment: Partial<ReachrCompany> = {};
      if (phone) enrichment.phone = phone;
      if (email) enrichment.email = email;
      if (website) enrichment.website = website;

      const fields = [
        phone ? "telefon" : null,
        email ? "e-post" : null,
        website ? "nettside" : null,
      ].filter((f): f is string => Boolean(f));

      return {
        company: Object.keys(enrichment).length ? enrichment : undefined,
        source: src(
          "active",
          fields,
          fields.length ? undefined : "1881 svarte, men uten kontaktpunkter.",
        ),
      };
    } catch (e) {
      return {
        source: src("error", [], e instanceof Error ? e.message : "1881-feil."),
      };
    }
  },
};

function src(
  status: "active" | "not_configured" | "error",
  fields: string[],
  message?: string,
) {
  return {
    provider: "api1881" as const,
    label: "1881",
    enabled: status === "active",
    fields,
    status,
    message,
  };
}

// Rekursivt samle alle strengverdier i et objekt/array (grunn nok for 1881).
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

// Normaliser til +47XXXXXXXX hvis strengen ser ut som et norsk telefonnummer.
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
