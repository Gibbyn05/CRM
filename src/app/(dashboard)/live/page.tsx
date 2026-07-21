import { createClient } from "@/lib/supabase/server";
import type { AgentState, Profile } from "@/lib/types";
import LiveBoard from "@/components/LiveBoard";
import { toLiveRows } from "@/lib/live";
import AgentStatusToggle from "@/components/AgentStatusToggle";

export const dynamic = "force-dynamic";

// Live agent-status dashboard — kjernefunksjonen salgssjefen bryr seg mest om.
export default async function LivePage() {
  const supabase = createClient();

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live-tavle</h1>
          <p className="text-sm text-slate-500">
            Sanntidsstatus for hele teamet
          </p>
        </div>
        <AgentStatusToggle />
      </div>

      <LiveBoard initialAgents={rows} />
    </div>
  );
}
