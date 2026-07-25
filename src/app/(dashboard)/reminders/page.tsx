import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import RemindersView from "@/components/RemindersView";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
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

  // Ledere kan tildele påminnelser til andre.
  let agents: { id: string; name: string }[] = [];
  if (isManager) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("is_active", true)
      .order("full_name");
    agents = (
      (data as Pick<Profile, "id" | "full_name" | "email">[]) ?? []
    ).map((p) => ({ id: p.id, name: p.full_name || p.email || "Ukjent" }));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Påminnelser</h1>
        <p className="text-sm text-slate-500">
          Oppfølging og huskelapper – forfalte dukker opp i varsel-bjella
        </p>
      </div>
      <RemindersView
        userId={user.id}
        isManager={isManager}
        agents={agents}
      />
    </div>
  );
}
