import type { CompanyLookupProvider } from "./types";

// ============================================================================
//  Utskiftbare telefonnummer-leverandører (sekundærkilder).
//
//  Brønnøysundregisteret har ikke telefonnummer. Ingen av 1881/Gule
//  Sider/180.no har en fri, offentlig dokumentert API for dette – alle tre
//  krever en kommersiell avtale/API-nøkkel. Vi bygger derfor et rent,
//  utskiftbart grensesnitt (CompanyLookupProvider) og lar hver leverandør stå
//  AV (ikke konfigurert) helt til noen limer inn en ekte nøkkel + riktig
//  base-URL for avtalen sin.
//
//  Ikke scraping: leverandørene kaller kun en konfigurert REST-URL med en
//  API-nøkkel. Er ingen nøkkel satt, gjøres ingen nettverkskall i det hele
//  tatt – oppslaget markerer bare feltet tydelig som "ikke tilgjengelig" (se
//  index.ts sine `notes`), uten å feile.
//
//  For å koble på en reell leverandør: sett miljøvariablene under (se
//  .env.example) og juster fetch-kallet i lookupPhone() til leverandørens
//  faktiske API-kontrakt (endepunkt/auth/respons-format varierer per avtale).
// ============================================================================

function makeStubPhoneProvider(opts: {
  id: CompanyLookupProvider["id"];
  label: string;
  apiKeyEnv: string;
  apiUrlEnv: string;
}): CompanyLookupProvider {
  return {
    id: opts.id,
    isConfigured: () => Boolean(process.env[opts.apiKeyEnv] && process.env[opts.apiUrlEnv]),

    async lookupPhone(orgNumber: string): Promise<string | null> {
      const apiKey = process.env[opts.apiKeyEnv];
      const baseUrl = process.env[opts.apiUrlEnv];
      if (!apiKey || !baseUrl) return null;

      try {
        // Generisk REST-mønster (Bearer-token + orgnr som query-param).
        // Bytt ut med leverandørens faktiske API-kontrakt når avtale/
        // dokumentasjon er på plass.
        const res = await fetch(`${baseUrl}?orgnr=${orgNumber}`, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { phone?: string; telefon?: string };
        return data.phone ?? data.telefon ?? null;
      } catch (e) {
        console.error(`${opts.label}-oppslag feilet:`, e instanceof Error ? e.message : e);
        return null;
      }
    },
  };
}

export const provider1881: CompanyLookupProvider = makeStubPhoneProvider({
  id: "provider_1881",
  label: "1881",
  apiKeyEnv: "PROVIDER_1881_API_KEY",
  apiUrlEnv: "PROVIDER_1881_API_URL",
});

export const providerGuleSider: CompanyLookupProvider = makeStubPhoneProvider({
  id: "provider_gulesider",
  label: "Gule Sider",
  apiKeyEnv: "PROVIDER_GULESIDER_API_KEY",
  apiUrlEnv: "PROVIDER_GULESIDER_API_URL",
});

export const provider180: CompanyLookupProvider = makeStubPhoneProvider({
  id: "provider_180",
  label: "180.no",
  apiKeyEnv: "PROVIDER_180_API_KEY",
  apiUrlEnv: "PROVIDER_180_API_URL",
});

// Prioritert rekkefølge – første konfigurerte leverandør som gir svar vinner.
export const PHONE_PROVIDERS: CompanyLookupProvider[] = [
  provider1881,
  providerGuleSider,
  provider180,
];
