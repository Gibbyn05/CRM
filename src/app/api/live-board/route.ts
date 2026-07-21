import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentState, Profile } from "@/lib/types";
import { toLiveRows } from "@/lib/live";

// Offentlig live-tavle-data for TV/kiosk-visningen. Bruker service-role slik
// at storskjermen kan vise status uten innlogging. Returnerer kun ikke-
// sensitive statusfelter.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();

  const [{ data: profiles }, { data: states }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "agent")
      .eq("is_active", true),
    supabase.from("agent_states").select("*"),
  ]);

  const rows = toLiveRows(
    (profiles as Pick<Profile, "id" | "full_name">[]) ?? [],
    (states as AgentState[]) ?? [],
  );

  return NextResponse.json({ agents: rows });
}
