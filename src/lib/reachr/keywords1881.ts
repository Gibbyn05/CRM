// Henter registrerte søkeord fra den offentlige 1881-profilen (gratis).
// Delt av api1881-provideren (dyp berikelse) og det lette
// /api/reachr/keywords1881-endepunktet (auto-sjekk av «Aktiv på 1881»-filteret).

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export async function fetch1881Keywords(orgNumber: string): Promise<string[]> {
  try {
    const res = await fetch(`https://www.1881.no/?query=${orgNumber}`, {
      headers: { Accept: "text/html", "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const html = await res.text();
    // Søkeord ligger som «emneknagger»-lenker (bransjekategoriene bruker andre).
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

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&aring;/gi, "å")
    .replace(/&oslash;/gi, "ø")
    .replace(/&aelig;/gi, "æ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
