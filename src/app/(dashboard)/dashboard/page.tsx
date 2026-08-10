import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import DashboardView from "@/components/DashboardView";
import { normalizeDashboardWidgets } from "@/lib/dashboard-widgets";

export const dynamic = "force-dynamic";

// Felles dashbord for alle roller. Selgere ser sine egne tall; ledere ser hele
// teamet (og får selgernavn på "Sist ringt"-lista).
export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single<Pick<Profile, "role" | "full_name">>();

  const isManager = me?.role === "manager";
  const firstName = (me?.full_name || "").split(/\s+/)[0] ?? "";
  const { data: preference } = await supabase
    .from("dashboard_preferences")
    .select("widgets")
    .eq("user_id", user.id)
    .maybeSingle<{ widgets: unknown }>();
  const initialWidgets = normalizeDashboardWidgets(preference?.widgets);

  // Ledere trenger navn på selgerne for "Sist ringt"-lista.
  let agentNames: Record<string, string> = {};
  if (isManager) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email");
    agentNames = Object.fromEntries(
      (
        (profiles as Pick<Profile, "id" | "full_name" | "email">[]) ?? []
      ).map((p) => [p.id, p.full_name || p.email || "Ukjent"]),
    );
  }

  return (
    <DashboardView
      isManager={isManager}
      userId={user.id}
      agentNames={agentNames}
      firstName={firstName}
      initialWidgets={initialWidgets}
    />
  );
}
