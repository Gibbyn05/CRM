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
    .select("role, reachr_search_preferences")
    .eq("id", user?.id ?? "")
    .single<Pick<Profile, "role" | "reachr_search_preferences">>();

  return (
    <div className="space-y-6">
      <ReachrTabs isManager={me?.role === "manager"} />
      <LeadSearchView
        userId={user?.id ?? ""}
        initialExcludeLogo1881={Boolean(me?.reachr_search_preferences?.exclude_1881_logo)}
      />
    </div>
  );
}
