import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import ReachrTabs from "@/components/reachr/ReachrTabs";
import ReachrExportOverview, {
  type ExportedLead,
} from "@/components/reachr/ReachrExportOverview";

export const dynamic = "force-dynamic";

// «Eksport til CRM» – kun ledere. Hver lead som lagres i Reachr oppretter
// eller kobles til en kunde i CRM-basen (customer_id settes alltid, se
// /api/reachr/leads), så antall rader i reachr_leads = antall eksporterte.
export default async function ReachrEksportPage() {
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

  const [{ data: leads }, { data: profiles }] = await Promise.all([
    supabase
      .from("reachr_leads")
      .select("id, org_number, name, owner_id, customer_id, status, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const ownerMap = new Map(
    ((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

  const exported: ExportedLead[] = (
    (leads as Omit<ExportedLead, "owner_name">[]) ?? []
  ).map((l) => ({
    ...l,
    owner_name: ownerMap.get(l.owner_id) ?? "Ukjent selger",
  }));

  return (
    <div className="space-y-6">
      <ReachrTabs />
      <ReachrExportOverview leads={exported} />
    </div>
  );
}
