import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { search1881Emneknagg } from "@/lib/reachr/emneknagger";

// GET /api/reachr/emneknagger?keyword=elektriker&location=oslo&page=1
// Lister bedrifter som er registrert på et 1881-søkeord (aktive annonsører).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "reachr:emneknagger",
    limit: 60,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const keyword = (sp.get("keyword") ?? "").trim();
  const location = (sp.get("location") ?? "").trim();
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  if (!keyword) {
    return NextResponse.json({ error: "Søkeord er påkrevd." }, { status: 400 });
  }

  try {
    const { companies, hasMore } = await search1881Emneknagg(
      keyword,
      location,
      page,
    );
    return NextResponse.json({ companies, page, hasMore });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Ukjent feil";
    return NextResponse.json(
      { error: `Kunne ikke hente fra 1881: ${m}` },
      { status: 502 },
    );
  }
}
