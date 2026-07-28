// Delte typer for automatisk firmaoppslag på organisasjonsnummer.
// Se src/lib/company-lookup/index.ts for orkestreringen og
// src/app/api/customers/brreg/route.ts for API-endepunktet som bruker den.

// Én oppslått verdi + hvilken kilde den kom fra (null hvis ikke funnet).
// Gjør at UI tydelig kan vise «henta fra Brønnøysund» per felt i stedet for
// å late som alt kommer fra samme sted.
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
  org_form: LookupField<string>;
  ceo_name: LookupField<string>;
  phone: LookupField<string>;
  address: LookupField<string>;
  postal_code: LookupField<string>;
  city: LookupField<string>;
  industry: LookupField<string>;
  // Flagg fra Enhetsregisteret som er nyttige å vise fram (konkurs e.l.).
  flags: { konkurs: boolean; underAvvikling: boolean };
  // Menneskelesbare merknader om manglende data / hvorfor et felt er tomt
  // (f.eks. "Ingen telefonileverandør konfigurert").
  notes: string[];
}

// Ett enkelt firmaoppslag en leverandør kan levere. Leverandører som ikke
// kan levere et felt lar det stå som null (håndteres av orkestratoren).
export interface CompanyBasics {
  name: string | null;
  org_form: string | null;
  ceo_name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  industry: string | null;
  konkurs: boolean;
  underAvvikling: boolean;
}

// Grensesnitt alle firmaoppslag-leverandører implementerer. En leverandør kan
// støtte kun deler av dataene (f.eks. kun telefonnummer) – returner null for
// felt den ikke har.
export interface CompanyLookupProvider {
  id: LookupSourceId;
  // Om leverandøren er konfigurert (API-nøkkel satt). Ukonfigurerte
  // leverandører hoppes stille over i stedet for å feile.
  isConfigured(): boolean;
  lookupBasics?(orgNumber: string): Promise<CompanyBasics | null>;
  lookupPhone?(orgNumber: string): Promise<string | null>;
}
