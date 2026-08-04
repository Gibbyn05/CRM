import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import LeadSearchView from "@/components/reachr/LeadSearchView";
import ReachrTabs from "@/components/reachr/ReachrTabs";

export const dynamic = "force-dynamic";

export default async function ReachrLeadSearchPage() {
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
      <LeadSearchView />
    </div>
  );
}
