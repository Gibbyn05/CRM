import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import Emneknagg1881View from "@/components/reachr/Emneknagg1881View";
import ReachrTabs from "@/components/reachr/ReachrTabs";

export const dynamic = "force-dynamic";

export default async function Reachr1881Page() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single<Pick<Profile, "role">>();

  return (
    <div className="space-y-6">
      <ReachrTabs isManager={me?.role === "manager"} />
      <Emneknagg1881View />
    </div>
  );
}
