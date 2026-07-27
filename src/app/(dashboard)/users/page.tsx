import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, RolePermission } from "@/lib/types";
import UsersAdmin from "@/components/UsersAdmin";

export const dynamic = "force-dynamic";

// Brukeradministrasjon + tilgangsstyring. Kun ledere.
export default async function UsersPage() {
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

  const [{ data: profiles }, { data: permissions }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .order("is_active", { ascending: false })
      .order("full_name"),
    supabase.from("role_permissions").select("*"),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Brukere og tilgang</h1>
        <p className="text-sm text-slate-500">
          Inviter og deaktiver brukere, og styr rettigheter for teamet.
        </p>
      </div>
      <UsersAdmin
        currentUserId={user.id}
        initialProfiles={(profiles as Profile[]) ?? []}
        initialPermissions={(permissions as RolePermission[]) ?? []}
      />
    </div>
  );
}
