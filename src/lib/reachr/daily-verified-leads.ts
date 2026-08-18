import { resolveOrgFor, search1881Emneknagg } from "./emneknagger";
import { fetch1881Profile } from "./keywords1881";

// Roteres daglig. Kandidater fra 1881s egen søkeord-katalog er første
// bevisledd, og profilen må deretter inneholde minst ett registrert søkeord.
const SEARCH_TERMS = [
  "regnskap", "elektriker", "rørlegger", "renhold", "alarm",
  "it", "bygg", "advokat", "rekruttering", "catering",
];

export interface Verified1881Candidate {
  orgNumber: string;
  profilePath: string;
  profileUrl: string;
  matchedTerm: string;
  keywords: string[];
}

export async function findVerified1881Candidates(
  date: Date,
  needed: number,
): Promise<Verified1881Candidate[]> {
  const day = Math.floor(date.getTime() / 86_400_000);
  const terms = SEARCH_TERMS.map((_, i) => SEARCH_TERMS[(day + i) % SEARCH_TERMS.length]);
  const listings = await Promise.all(terms.map((term) => search1881Emneknagg(term, "", 1)));
  const seen = new Set<string>();
  const verified: Verified1881Candidate[] = [];

  for (let index = 0; index < listings.length && verified.length < needed; index++) {
    for (const listing of listings[index].companies) {
      if (verified.length >= needed) break;
      const orgNumber = await resolveOrgFor(listing.path, listing.name);
      if (!orgNumber || seen.has(orgNumber)) continue;
      seen.add(orgNumber);

      // Strengt krav: både treff i 1881s søkeord-katalog og søkeord på
      // firmakortet. Mangler ett av bevisleddene, blir selskapet ikke brukt.
      const profile = await fetch1881Profile(orgNumber);
      if (!profile.keywords.length) continue;
      verified.push({
        orgNumber,
        profilePath: listing.path,
        profileUrl: `https://www.1881.no${listing.path}/`,
        matchedTerm: terms[index],
        keywords: profile.keywords,
      });
    }
  }
  return verified;
}
