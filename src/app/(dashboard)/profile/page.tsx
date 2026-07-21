import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import ProfileForm from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Min profil</h1>
        <p className="text-sm text-slate-500">
          Endre navn, telefon og profilbilde
        </p>
      </div>
      {profile ? (
        <ProfileForm profile={profile} />
      ) : (
        <p className="text-slate-500">Fant ikke profilen din.</p>
      )}
    </div>
  );
}
