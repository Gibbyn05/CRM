import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AgentState, Profile } from "@/lib/types";
import LiveBoard from "@/components/LiveBoard";
import { toLiveRows } from "@/lib/live";

export const dynamic = "force-dynamic";

// Live agent-status dashboard — kun for ledere. Selgere skal ikke overvåke
// hverandre, så de sendes til sitt eget dashbord.
export default async function LivePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();
  if (me?.role !== "manager") redirect("/dashboard");

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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Live-tavle</h1>
        <p className="text-sm text-slate-500">Sanntidsstatus for hele teamet</p>
      </div>

      <LiveBoard initialAgents={rows} />
    </div>
  );
}
