import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import DashboardView from "@/components/DashboardView";

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
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  const isManager = me?.role === "manager";

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
    />
  );
}
