import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ContractTemplate, Profile } from "@/lib/types";
import TemplatesManager from "@/components/TemplatesManager";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, { data: templates }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single<Pick<Profile, "role">>(),
    supabase.from("contract_templates").select("*").order("name"),
  ]);
  const isManager = me?.role === "manager";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kontrakt- og e-postmaler</h1>
        <p className="text-sm text-slate-500">
          Brukes når selgere sender tilbud/kontrakt fra kundekortet
          {isManager ? "" : " (kun salgssjef kan redigere)"}
        </p>
      </div>
      <TemplatesManager
        initialTemplates={(templates as ContractTemplate[]) ?? []}
        isManager={isManager}
      />
    </div>
  );
}
