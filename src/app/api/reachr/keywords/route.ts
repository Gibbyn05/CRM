import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { ReachrDataSource } from "@/lib/reachr";
import { suggestInternalKeywords, type KeywordSuggestion } from "@/lib/reachr/keywords";
import { eniroProvider } from "@/lib/reachr/providers/eniro";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface CombinedKeyword {
  keyword: string;
  source: "internal" | "gulesider";
  nace_code: string | null;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "reachr:keywords",
    limit: 40,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const query = (sp.get("q") ?? "").trim();
  const industry = (sp.get("industry") ?? "").trim();

  if (!query && !industry) {
    return NextResponse.json({ suggestions: [], gulesider_status: notConfiguredSource() });
  }

  const internal: KeywordSuggestion[] = suggestInternalKeywords(query, industry);
  const gulesiderResult = eniroProvider.suggestKeywords
    ? await eniroProvider.suggestKeywords(query || industry)
    : { keywords: [], source: notConfiguredSource() };

  const internalKeywords = new Set(internal.map((item) => item.keyword));
  const combined: CombinedKeyword[] = [
    ...internal,
    ...gulesiderResult.keywords
      .filter((keyword) => !internalKeywords.has(keyword))
      .map((keyword) => ({ keyword, source: "gulesider" as const, nace_code: null })),
  ];

  return NextResponse.json({ suggestions: combined, gulesider_status: gulesiderResult.source });
}

function notConfiguredSource(): ReachrDataSource {
  return {
    provider: "eniro",
    label: "Eniro / Gule Sider",
    enabled: false,
    fields: [],
    status: "not_configured",
    message: "Mangler ENIRO_PROFILE og ENIRO_KEY.",
  };
}
