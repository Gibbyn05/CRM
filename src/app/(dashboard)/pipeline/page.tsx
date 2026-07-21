import { createClient } from "@/lib/supabase/server";
import type { Customer, Deal } from "@/lib/types";
import PipelineBoard from "@/components/PipelineBoard";

export const dynamic = "force-dynamic";

export interface DealWithCustomer extends Deal {
  customer_name: string;
}

export default async function PipelinePage() {
  const supabase = createClient();

  const { data: deals } = await supabase
    .from("deals")
    .select("*")
    .order("updated_at", { ascending: false });

  const customerIds = [
    ...new Set(((deals as Deal[]) ?? []).map((d) => d.customer_id)),
  ];
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name")
    .in("id", customerIds.length ? customerIds : ["00000000-0000-0000-0000-000000000000"]);

  const nameMap = new Map(
    ((customers as Pick<Customer, "id" | "name">[]) ?? []).map((c) => [
      c.id,
      c.name,
    ]),
  );

  const enriched: DealWithCustomer[] = ((deals as Deal[]) ?? []).map((d) => ({
    ...d,
    customer_name: nameMap.get(d.customer_id) ?? "Ukjent kunde",
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
        <p className="text-sm text-slate-500">
          Ringt → Tilbud sendt → Akseptert / Tapt
        </p>
      </div>
      <PipelineBoard initialDeals={enriched} />
    </div>
  );
}
