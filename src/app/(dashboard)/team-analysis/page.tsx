import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import TeamAnalysis from "@/components/TeamAnalysis";

export const dynamic = "force-dynamic";

export default async function TeamAnalysisPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();

  if (profile?.role !== "manager") redirect("/dashboard");

  return <TeamAnalysis />;
}
