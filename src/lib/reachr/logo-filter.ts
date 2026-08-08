// ============================================================================
//  Ren, klienttrygg hjelpefunksjon for 1881-logofilteret (ingen server-only
//  avhengigheter — trygg å importere direkte i klientkomponenter).
// ============================================================================

export type Logo1881Status = "found" | "not_found" | "uncertain" | "not_checked";

// Kun BEKREFTET logo skjuler en bedrift når filteret er aktivert. Usikre
// treff og bedrifter som ikke er kontrollert (ennå, eller pga. feil/manglende
// tilgang) vises fortsatt — vi antar aldri at de har logo.
export function shouldHideCompany(status: Logo1881Status | undefined, filterEnabled: boolean): boolean {
  if (!filterEnabled) return false;
  return status === "found";
}
