import { isValidOrgNumber } from "@/lib/format";
import { brregProvider } from "./brreg";
import { PHONE_PROVIDERS } from "./phone-providers";
import type { CompanyLookupResult, LookupField, LookupSourceId } from "./types";

export type { CompanyLookupResult, LookupField, LookupSourceId } from "./types";
export { LOOKUP_SOURCE_LABELS } from "./types";

// ============================================================================
//  Orkestrator for firmaoppslag på org.nr. Brønnøysundregistrene er
//  primærkilde for navn/adresse/daglig leder (offisielt, gratis, ingen
//  nøkkel). Telefonnummer forsøkes hentet fra de konfigurerte, pluggbare
//  sekundærkildene (1881/Gule Sider/180.no) i prioritert rekkefølge – ingen
//  scraping, kun offisielle/avtalte API-er.
//
//  Hvert felt i resultatet er tagget med hvilken kilde det kom fra
//  ("vis kilde"-kravet). Manglende data håndteres gracefully: feltet blir
//  null/source:null og en menneskelesbar merknad legges i `notes`.
// ============================================================================

function empty<T>(): LookupField<T> {
  return { value: null, source: null };
}
function found<T>(value: T, source: LookupSourceId): LookupField<T> {
  return { value, source };
}

export class InvalidOrgNumberError extends Error {}
export class CompanyNotFoundError extends Error {}

export async function lookupCompany(orgNumberRaw: string): Promise<CompanyLookupResult> {
  const orgNumber = orgNumberRaw.replace(/\s/g, "");
  if (!isValidOrgNumber(orgNumber)) {
    throw new InvalidOrgNumberError(
      "Organisasjonsnummer må være 9 siffer med gyldig kontrollsiffer.",
    );
  }

  const notes: string[] = [];

  // 1) Primærkilde: Brønnøysundregistrene (navn, adresse, daglig leder).
  const basics = await brregProvider.lookupBasics!(orgNumber);
  if (!basics) {
    throw new CompanyNotFoundError(
      "Fant ingen bedrift med dette organisasjonsnummeret i Brønnøysundregisteret.",
    );
  }

  const result: CompanyLookupResult = {
    org_number: orgNumber,
    name: basics.name ? found(basics.name, "brreg") : empty(),
    ceo_name: basics.ceo_name ? found(basics.ceo_name, "brreg") : empty(),
    address: basics.address ? found(basics.address, "brreg") : empty(),
    postal_code: basics.postal_code ? found(basics.postal_code, "brreg") : empty(),
    city: basics.city ? found(basics.city, "brreg") : empty(),
    industry: basics.industry ? found(basics.industry, "brreg") : empty(),
    phone: empty(),
    notes,
  };

  if (!basics.ceo_name) {
    notes.push(
      "Daglig leder ikke funnet i rolleoversikten (kan mangle for enkelte selskapsformer).",
    );
  }

  // 2) Telefonnummer: første konfigurerte sekundærkilde som svarer.
  const configuredPhoneProviders = PHONE_PROVIDERS.filter((p) => p.isConfigured());
  if (configuredPhoneProviders.length === 0) {
    notes.push(
      "Telefonnummer ikke tilgjengelig – ingen telefonileverandør (1881/Gule Sider/180.no) er konfigurert.",
    );
  } else {
    for (const provider of configuredPhoneProviders) {
      try {
        const phone = await provider.lookupPhone!(orgNumber);
        if (phone) {
          result.phone = found(phone, provider.id);
          break;
        }
      } catch (e) {
        console.error(`Telefonoppslag (${provider.id}) feilet:`, e);
      }
    }
    if (!result.phone.value) {
      notes.push("Fant ikke telefonnummer hos noen av de konfigurerte leverandørene.");
    }
  }

  return result;
}
