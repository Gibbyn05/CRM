// ============================================================================
//  1881 emneknagg-søk («søkeord»-katalog).
//
//  1881 lister bedrifter som HAR registrert et gitt søkeord under
//  https://www.1881.no/emneknagger/<søkeord>[/<sted>]. Dette er den ekte
//  «finn alle som annonserer på 1881 for X»-listen. Vi skraper den offentlige
//  siden (gratis) og henter navn, telefon og profil-lenke per bedrift.
//
//  Org.nr ligger ikke i lista, men i bedriftens profil (feltet «leiCode»), så
//  det slås opp ved behov (når man legger til bedriften som lead).
// ============================================================================

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export interface Emneknagg1881Company {
  name: string;
  path: string; // 1881-profilsti, f.eks. /elektriker/.../firma_100607161S1
  phone: string | null;
  area: string | null;
}

export interface Emneknagg1881Result {
  companies: Emneknagg1881Company[];
  hasMore: boolean;
}

export async function search1881Emneknagg(
  keyword: string,
  location: string,
  page: number,
): Promise<Emneknagg1881Result> {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return { companies: [], hasMore: false };
  const loc = location.trim().toLowerCase();
  let url = `https://www.1881.no/emneknagger/${encodeURIComponent(kw)}`;
  if (loc) url += `/${encodeURIComponent(loc)}`;
  if (page > 1) url += `?page=${page}`;

  const res = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": UA },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 3600 },
  });
  if (!res.ok) return { companies: [], hasMore: false };
  const html = await res.text();

  const titleRe = /href="(\/[^"]+?_\d+S\d+)\/"[^>]*>([^<]+)<\/a>\s*<\/h2>/gi;
  const matches = [...html.matchAll(titleRe)];
  const companies: Emneknagg1881Company[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const path = m[1];
    const name = decodeEntities(m[2]).trim();
    // Telefon: første tel:-lenke mellom denne og neste bedrift.
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? html.length : start + 1500;
    const region = html.slice(start, end);
    const tel =
      region.match(/tel:0047(\d{8})/) ?? region.match(/tel:\+?47(\d{8})/);
    const phone = tel ? `+47${tel[1]}` : null;
    companies.push({ name, path, phone, area: areaFromPath(path) });
  }

  const hasMore = /rel="next"/i.test(html);
  return { companies, hasMore };
}

// Slår opp org.nr for en 1881-profil. Primært via «leiCode» i profilen (som er
// org.nr for norske selskaper), med Brønnøysund-navnesøk som reserve.
export async function resolveOrgFor(
  path: string,
  name: string,
): Promise<string | null> {
  try {
    const res = await fetch(`https://www.1881.no${path}/`, {
      headers: { Accept: "text/html", "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 86400 },
    });
    if (res.ok) {
      const html = await res.text();
      const lei = html.match(/"leiCode":"(\d{9})"/);
      if (lei) return lei[1];
    }
  } catch {
    /* faller tilbake til navnesøk */
  }
  return orgFromBrregName(name);
}

async function orgFromBrregName(name: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(
        name,
      )}&size=1`,
      { headers: { Accept: "application/json" }, next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      _embedded?: { enheter?: { organisasjonsnummer?: string; navn?: string }[] };
    };
    const hit = data._embedded?.enheter?.[0];
    if (!hit?.organisasjonsnummer) return null;
    // Enkel likhetssjekk: begge navn (uten selskapsform) må dele hovedordet.
    const norm = (s: string) =>
      s.toLowerCase().replace(/\b(as|asa|da|ans|enk)\b/g, "").replace(/\s+/g, " ").trim();
    const a = norm(name);
    const b = norm(hit.navn ?? "");
    if (a && b && (b.includes(a.split(" ")[0]) || a.includes(b.split(" ")[0]))) {
      return hit.organisasjonsnummer;
    }
    return null;
  } catch {
    return null;
  }
}

function areaFromPath(path: string): string | null {
  const segs = path.split("/").filter(Boolean);
  // segs: [keyword, keyword-region, keyword-area, firma_id]
  const seg = segs[2] ?? segs[1];
  if (!seg) return null;
  const parts = seg.split("-").slice(1); // dropp søkeord-prefikset
  const area = parts.join(" ").trim();
  return area ? area.charAt(0).toUpperCase() + area.slice(1) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&aring;/gi, "å")
    .replace(/&oslash;/gi, "ø")
    .replace(/&aelig;/gi, "æ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
