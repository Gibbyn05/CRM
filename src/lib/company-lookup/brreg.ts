import type { CompanyBasics, CompanyLookupProvider } from "./types";

// ============================================================================
//  Brønnøysundregistrene (Enhetsregisteret) — PRIMÆRKILDE for firmaoppslag.
//  Offisielt, gratis, åpent API. Ingen nøkkel, ingen scraping.
//
//  Basisdata: https://data.brreg.no/enhetsregisteret/api/enheter/{orgnr}
//  Roller (for daglig leder): .../enheter/{orgnr}/roller
// ============================================================================

interface BrregAddress {
  adresse?: string[];
  postnummer?: string;
  poststed?: string;
}
interface BrregEnhet {
  organisasjonsnummer?: string;
  navn?: string;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  forretningsadresse?: BrregAddress;
  postadresse?: BrregAddress;
  naeringskode1?: { beskrivelse?: string };
  konkurs?: boolean;
  underAvvikling?: boolean;
}

interface BrregPersonNavn {
  fornavn?: string;
  mellomnavn?: string;
  etternavn?: string;
}
interface BrregRolle {
  type?: { kode?: string; beskrivelse?: string };
  fratraadt?: boolean;
  person?: { navn?: BrregPersonNavn };
  enhet?: { navn?: string };
}
interface BrregRollegruppe {
  type?: { kode?: string; beskrivelse?: string };
  roller?: BrregRolle[];
}
interface BrregRolleResponse {
  rollegrupper?: BrregRollegruppe[];
}

// Roller vi ser etter for "daglig leder", i prioritert rekkefølge.
// DAGL = daglig leder, INNH = innehaver (enkeltpersonforetak),
// KOMP = komplementar (ANS/DA uten egen daglig leder).
const CEO_ROLE_CODES = ["DAGL", "INNH", "KOMP"];

function fullName(navn?: BrregPersonNavn): string | null {
  if (!navn) return null;
  const parts = [navn.fornavn, navn.mellomnavn, navn.etternavn].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

// Henter daglig leder (eller nærmeste tilsvarende rolle). Roller er et
// "nice to have" – et feilende eller tomt svar skal aldri stoppe resten av
// oppslaget, så alle feil svelges her og gir bare null tilbake.
async function fetchCeoName(orgNumber: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://data.brreg.no/enhetsregisteret/api/enheter/${orgNumber}/roller`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as BrregRolleResponse;
    const grupper = data.rollegrupper ?? [];

    for (const code of CEO_ROLE_CODES) {
      const gruppe = grupper.find((g) => g.type?.kode === code);
      const rolle = gruppe?.roller?.find((r) => !r.fratraadt);
      if (!rolle) continue;
      const name = fullName(rolle.person?.navn) ?? rolle.enhet?.navn ?? null;
      if (name) return name;
    }
    return null;
  } catch {
    return null;
  }
}

export function capitalizeWords(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
}

export const brregProvider: CompanyLookupProvider = {
  id: "brreg",
  // Åpent API uten nøkkel – alltid "konfigurert".
  isConfigured: () => true,

  async lookupBasics(orgNumber: string): Promise<CompanyBasics | null> {
    const res = await fetch(
      `https://data.brreg.no/enhetsregisteret/api/enheter/${orgNumber}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Brønnøysund svarte med status ${res.status}`);
    }

    const e = (await res.json()) as BrregEnhet;
    const addr = e.forretningsadresse ?? e.postadresse;
    const ceoName = await fetchCeoName(orgNumber);

    return {
      name: e.navn ?? null,
      org_form: e.organisasjonsform?.beskrivelse ?? null,
      ceo_name: ceoName,
      address: (addr?.adresse ?? []).filter(Boolean).join(", ") || null,
      postal_code: addr?.postnummer ?? null,
      city: addr?.poststed ? capitalizeWords(addr.poststed) : null,
      industry: e.naeringskode1?.beskrivelse ?? null,
      konkurs: e.konkurs ?? false,
      underAvvikling: e.underAvvikling ?? false,
    };
  },
};
