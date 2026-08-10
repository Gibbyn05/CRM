import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentState, Profile } from "@/lib/types";
import { toLiveRows } from "@/lib/live";
import { enforceRateLimit } from "@/lib/rate-limit";

// Offentlig live-tavle-data for TV/kiosk-visningen. Bruker service-role slik
// at storskjermen kan vise status uten innlogging. Returnerer kun ikke-
// sensitive statusfelter.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Offentlig endepunkt (ingen innlogging) – begrens pr. IP.
  const limited = await enforceRateLimit(req, {
    name: "live-board",
    limit: 180,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const supabase = createAdminClient();

  const [profilesResult, statesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("is_active", true),
    supabase.from("agent_states").select("*"),
  ]);

  if (profilesResult.error || statesResult.error) {
    console.error("Kunne ikke laste TV-status", {
      profiles: profilesResult.error?.message,
      states: statesResult.error?.message,
    });
    return NextResponse.json(
      { error: "Kunne ikke laste live-status" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rows = toLiveRows(
    (profilesResult.data as Pick<
      Profile,
      "id" | "full_name" | "avatar_url"
    >[]) ?? [],
    (statesResult.data as AgentState[]) ?? [],
  );

  return NextResponse.json(
    { agents: rows, generated_at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
