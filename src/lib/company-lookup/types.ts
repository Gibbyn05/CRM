// Delte typer for firmaoppslag på organisasjonsnummer. Se README.md for en
// oversikt over kildene og hvordan de er koblet sammen.

// Én oppslått verdi + hvilken kilde den kom fra (eller null hvis ikke funnet).
// "vis kilde"-kravet dekkes ved at UI kan slå opp `source` per felt.
export interface LookupField<T> {
  value: T | null;
  source: LookupSourceId | null;
}

export type LookupSourceId =
  | "brreg"
  | "provider_1881"
  | "provider_gulesider"
  | "provider_180";

export const LOOKUP_SOURCE_LABELS: Record<LookupSourceId, string> = {
  brreg: "Brønnøysundregistrene",
  provider_1881: "1881",
  provider_gulesider: "Gule Sider",
  provider_180: "180.no",
};

export interface CompanyLookupResult {
  org_number: string;
  name: LookupField<string>;
  ceo_name: LookupField<string>;
  phone: LookupField<string>;
  address: LookupField<string>;
  postal_code: LookupField<string>;
  city: LookupField<string>;
  industry: LookupField<string>;
  // Menneskelesbare merknader om manglende data / hvorfor et felt er tomt
  // (f.eks. "Ingen telefonileverandør konfigurert").
  notes: string[];
}

// Ett enkelt firmaoppslag-felt en leverandør kan levere. Leverandører som
// ikke kan levere et felt returnerer bare null for det (håndteres av
// orkestratoren i index.ts).
export interface CompanyBasics {
  name: string | null;
  ceo_name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  industry: string | null;
}

// Grensesnitt alle firmaoppslag-leverandører implementerer. En leverandør kan
// støtte kun deler av dataene (f.eks. kun telefonnummer) – returner null for
// felt den ikke har.
export interface CompanyLookupProvider {
  id: LookupSourceId;
  // Om leverandøren er konfigurert (API-nøkkel satt). Ukonfigurerte
  // leverandører hoppes over i stedet for å feile.
  isConfigured(): boolean;
  lookupBasics?(orgNumber: string): Promise<CompanyBasics | null>;
  lookupPhone?(orgNumber: string): Promise<string | null>;
}
