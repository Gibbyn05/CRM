import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import ProfileTabs from "@/components/ProfileTabs";
import TeamDirectory, { type TeamMember } from "@/components/TeamDirectory";

export const dynamic = "force-dynamic";

// Team-fanen: alle aktive kolleger med navn + profilbilde, og direktemeldinger.
export default async function TeamPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, role, is_active")
    .eq("is_active", true)
    .order("full_name");

  const all = (profiles as Pick<
    Profile,
    "id" | "full_name" | "email" | "avatar_url" | "role" | "is_active"
  >[]) ?? [];

  const meRow = all.find((p) => p.id === user.id);
  const me = {
    id: user.id,
    name: meRow?.full_name || meRow?.email || "Deg",
    avatar_url: meRow?.avatar_url ?? null,
  };

  const members: TeamMember[] = all
    .filter((p) => p.id !== user.id)
    .map((p) => ({
      id: p.id,
      name: p.full_name || p.email || "Ukjent",
      avatar_url: p.avatar_url,
      role: p.role,
    }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profil</h1>
        <p className="text-sm text-slate-500">Din profil og teamet ditt</p>
      </div>
      <ProfileTabs />

      {members.length > 0 ? (
        <TeamDirectory me={me} members={members} />
      ) : (
        <div className="card p-10 text-center text-sm text-slate-500">
          Ingen andre teammedlemmer ennå.
        </div>
      )}
    </div>
  );
}
