import { NACE_KEYWORDS, guessNaceCode } from "@/lib/reachr";

// ============================================================================
//  Interne søkeordforslag basert på vår egen bransjeordbok (NACE_KEYWORDS).
//  Ikke hentet fra Gule Sider — kun en fungerende reserveløsning som brukes
//  når Eniro/Gule Sider-integrasjonen (se providers/eniro.ts) ikke er
//  konfigurert. Merkes tydelig som "internal" i UI slik at det aldri
//  fremstår som om det kommer fra Gule Sider.
// ============================================================================

export interface KeywordSuggestion {
  keyword: string;
  source: "internal";
  nace_code: string | null;
}

export function suggestInternalKeywords(query: string, industry?: string): KeywordSuggestion[] {
  const base = (industry || query).toLowerCase().trim();
  if (!base) return [];
  const naceCode = guessNaceCode(base);
  if (!naceCode) return [];

  const seen = new Set([base]);
  const suggestions: KeywordSuggestion[] = [];
  for (const [keyword, code] of Object.entries(NACE_KEYWORDS)) {
    if (code !== naceCode) continue;
    if (seen.has(keyword)) continue;
    seen.add(keyword);
    suggestions.push({ keyword, source: "internal", nace_code: code });
  }
  return suggestions.slice(0, 12);
}
