import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import ProfileForm from "@/components/ProfileForm";
import ProfileTabs from "@/components/ProfileTabs";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { setup?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profil</h1>
        <p className="text-sm text-slate-500">
          Din profil og teamet ditt
        </p>
      </div>
      <ProfileTabs />
      {profile ? (
        <ProfileForm profile={profile} showSetupNotice={searchParams.setup === "1"} />
      ) : (
        <p className="text-slate-500">Fant ikke profilen din.</p>
      )}
    </div>
  );
}
