import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Contract, Customer, Profile } from "@/lib/types";
import ContractStatusOverview, {
  type ContractWithNames,
} from "@/components/ContractStatusOverview";

export const dynamic = "force-dynamic";

// «Signering» – status/oversikt over alle kontrakter (kladd/sendt/åpnet/
// signert/avslått) på tvers av alle selgere. Kun ledere: gir innsikt i
// signeringsgrad uten å måtte åpne hvert kundekort for seg.
export default async function SigneringPage() {
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

  const [{ data: contracts }, { data: customers }, { data: profiles }] =
    await Promise.all([
      supabase.from("contracts").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id, name"),
      supabase.from("profiles").select("id, full_name"),
    ]);

  const nameMap = new Map(
    ((customers as Pick<Customer, "id" | "name">[]) ?? []).map((c) => [
      c.id,
      c.name,
    ]),
  );
  const ownerMap = new Map(
    ((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

  const enriched: ContractWithNames[] = ((contracts as Contract[]) ?? []).map(
    (c) => ({
      ...c,
      customer_name: nameMap.get(c.customer_id) ?? "Ukjent kunde",
      agent_name: c.agent_id ? ownerMap.get(c.agent_id) ?? null : null,
    }),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Signering – status og oversikt
        </h1>
        <p className="text-sm text-slate-500">
          Alle sendte kontrakter på tvers av selgere: kladd, sendt, åpnet,
          signert og avslått. Kun synlig for ledere.
        </p>
      </div>
      <ContractStatusOverview contracts={enriched} />
    </div>
  );
}
