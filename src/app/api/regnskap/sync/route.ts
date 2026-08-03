import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { syncCommissionsWithFiken } from "@/lib/fiken-sync";

// ============================================================================
//  POST /api/regnskap/sync
//  Synkroniserer provisjonsstatus mot Fiken. To måter å autentisere:
//   - Leder-sesjon (knappen i regnskapsmenyen), eller
//   - Cron: header X-Cron-Secret = CRON_SECRET (Prompt 3, planlagt jobb).
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, {
    name: "regnskap:sync",
    limit: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // Cron-vei: gyldig hemmelig header slipper forbi leder-sjekken.
  const cronSecret = req.headers.get("x-cron-secret");
  const isCron = Boolean(
    process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET,
  );

  if (!isCron) {
    // Interaktiv vei: må være innlogget leder.
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
    }
    const { data: me } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (me?.role !== "manager") {
      return NextResponse.json({ error: "Kun ledere" }, { status: 403 });
    }
  }

  try {
    const admin = createAdminClient();
    const result = await syncCommissionsWithFiken(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Ukjent feil";
    console.error("Fiken-sync feilet:", m);
    return NextResponse.json({ error: m }, { status: 502 });
  }
}
