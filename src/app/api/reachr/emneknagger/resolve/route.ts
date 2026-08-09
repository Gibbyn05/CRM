import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveOrgFor } from "@/lib/reachr/emneknagger";

// GET /api/reachr/emneknagger/resolve?path=<1881-profilsti>&name=<navn>
// Slår opp org.nr for en 1881-oppføring (brukes når man legger den til som lead).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "reachr:emneknagger-resolve",
    limit: 60,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const path = (sp.get("path") ?? "").trim();
  const name = (sp.get("name") ?? "").trim();
  if (!path.startsWith("/")) {
    return NextResponse.json({ error: "Ugyldig sti." }, { status: 400 });
  }

  const org = await resolveOrgFor(path, name);
  if (!org) {
    return NextResponse.json(
      { error: "Fant ikke organisasjonsnummer for bedriften." },
      { status: 404 },
    );
  }
  return NextResponse.json({ org_number: org });
}
