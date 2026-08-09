import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fetch1881Keywords } from "@/lib/reachr/keywords1881";

// ============================================================================
//  GET /api/reachr/keywords1881?orgnr=XXXXXXXXX
//  Lett oppslag: KUN 1881-søkeord (én sidehenting), uten Proff/nettside/telefon.
//  Brukes til auto-sjekk når «Aktiv på 1881»-filteret slås på.
// ============================================================================

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "reachr:keywords1881",
    limit: 300,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const orgnr = (req.nextUrl.searchParams.get("orgnr") ?? "").replace(/\D/g, "");
  if (!/^\d{9}$/.test(orgnr)) {
    return NextResponse.json(
      { error: "Organisasjonsnummer må være 9 siffer." },
      { status: 400 },
    );
  }

  const keywords = await fetch1881Keywords(orgnr);
  return NextResponse.json({ org_number: orgnr, keywords });
}
