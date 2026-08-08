import { mergeReachrCompany, type ReachrSearchResult } from "@/lib/reachr";

// ============================================================================
//  Slår sammen søkeresultater fra flere kilder/søkeord på org.nr, uten å
//  lage duplikater. Beholder matched_keyword fra det FØRSTE treffet
//  (hovedsøket vinner over ekstra søkeord som senere gir samme bedrift).
// ============================================================================
export function mergeSearchResults(
  primary: ReachrSearchResult[],
  extra: ReachrSearchResult[],
): ReachrSearchResult[] {
  const map = new Map<string, ReachrSearchResult>();
  for (const company of [...primary, ...extra]) {
    if (!company.org_number) continue;
    const existing = map.get(company.org_number);
    if (!existing) {
      map.set(company.org_number, company);
      continue;
    }
    // Beholder eksisterende (først sett) matched_keyword uendret — inkludert
    // når den er null (hovedsøket) — slik at et senere søkeord-treff på
    // samme bedrift ikke overskriver at den egentlig kom fra hovedsøket.
    map.set(company.org_number, {
      ...mergeReachrCompany(existing, company),
      matched_keyword: existing.matched_keyword,
    });
  }
  return [...map.values()];
}
