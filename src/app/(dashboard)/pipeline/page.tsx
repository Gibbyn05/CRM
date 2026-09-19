import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Deal, Profile } from "@/lib/types";
import PipelineBoard from "@/components/PipelineBoard";
import { dedupeCustomers, dedupeDeals } from "@/lib/dedupe";

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
      supabase.from("customers").select("id, name, org_number").order("name"),
      supabase.from("profiles").select("id, full_name"),
    ]);

  const customerRows = (customers as Pick<Customer, "id" | "name" | "org_number">[]) ?? [];
  const customerList = dedupeCustomers(customerRows);
  // Kundelisten dedupliseres for velgeren, men en avtale kan ligge på en
  // eldre duplikatrad. Bruk derfor alle faktiske kunder til pipeline-kartet.
  // Avtaler uten kundekort filtreres bort helt, i stedet for å vises som
  // «Ukjent kunde».
  const nameMap = new Map(customerRows.map((customer) => [customer.id, customer.name]));
  const ownerMap = new Map(
    ((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

  const enriched: DealWithCustomer[] = dedupeDeals(
    ((deals as Deal[]) ?? [])
      .filter((deal) => nameMap.has(deal.customer_id))
      .map((deal) => ({
        ...deal,
        customer_name: nameMap.get(deal.customer_id) as string,
        owner_name: deal.agent_id ? ownerMap.get(deal.agent_id) ?? null : null,
      })),
  );

  return (
    <PipelineBoard
      initialDeals={enriched}
      customers={customerList}
      currentUserId={user.id}
      currentUserName={ownerMap.get(user.id) ?? ""}
    />
  );
}
