import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Deal, Profile } from "@/lib/types";
import PipelineBoard from "@/components/PipelineBoard";

export const dynamic = "force-dynamic";

export interface DealWithCustomer extends Deal {
  customer_name: string;
  owner_name: string | null;
}

export default async function PipelinePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: deals }, { data: customers }, { data: profiles }] =
    await Promise.all([
      supabase.from("deals").select("*").order("updated_at", { ascending: false }),
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("profiles").select("id, full_name"),
    ]);

  const customerList = (customers as Pick<Customer, "id" | "name">[]) ?? [];
  const nameMap = new Map(customerList.map((c) => [c.id, c.name]));
  const ownerMap = new Map(
    ((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

  const enriched: DealWithCustomer[] = ((deals as Deal[]) ?? []).map((d) => ({
    ...d,
    customer_name: nameMap.get(d.customer_id) ?? "Ukjent kunde",
    owner_name: d.agent_id ? ownerMap.get(d.agent_id) ?? null : null,
  }));

  return (
    <PipelineBoard
      initialDeals={enriched}
      customers={customerList}
      currentUserId={user.id}
      currentUserName={ownerMap.get(user.id) ?? ""}
    />
  );
}
