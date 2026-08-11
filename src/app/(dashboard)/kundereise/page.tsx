import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import CustomerJourneyBoard, {
  type JourneyStage,
  type JourneyCustomer,
} from "@/components/CustomerJourneyBoard";
import { dedupeCustomers } from "@/lib/dedupe";

export const dynamic = "force-dynamic";

const DEFAULT_STAGES = [
  { name: "Ny kunde", color: "#3b82f6", sort_order: 10 },
  { name: "Kartlegging", color: "#8b5cf6", sort_order: 20 },
  { name: "Oppfølging", color: "#f59e0b", sort_order: 30 },
  { name: "Aktiv kunde", color: "#22c55e", sort_order: 40 },
];

export default async function KundereisePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data: statuses } = await supabase
    .from("customer_journey_stages")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  if (!statuses?.length) {
    const { data: seeded, error: seedError } = await supabase
      .from("customer_journey_stages")
      .insert(DEFAULT_STAGES.map((stage) => ({ ...stage, user_id: user.id })))
      .select("*");
    if (seedError) {
      const { data: existing } = await supabase
        .from("customer_journey_stages")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });
      statuses = existing ?? [];
    } else {
      statuses = seeded ?? [];
    }
  }

  const [{ data: positions }, { data: customers }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("customer_journey_positions")
        .select("customer_id, stage_id")
        .eq("user_id", user.id),
      supabase
        .from("customers")
        .select("id, name, org_number, owner_id")
        .order("name", { ascending: true }),
      supabase.from("profiles").select("id, full_name"),
    ]);

  const ownerMap = new Map(
    ((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ]),
  );
  const positionMap = new Map(
    ((positions as { customer_id: string; stage_id: string | null }[]) ?? [])
      .map((position) => [position.customer_id, position.stage_id]),
  );

  const rows: JourneyCustomer[] = dedupeCustomers((
    (customers as {
      id: string;
      name: string;
      org_number: string | null;
      owner_id: string | null;
    }[]) ?? []
  ), null).map((c) => ({
    id: c.id,
    name: c.name,
    org_number: c.org_number,
    journey_stage_id: positionMap.get(c.id) ?? null,
    owner_name: c.owner_id ? ownerMap.get(c.owner_id) ?? null : null,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kundereise</h1>
        <p className="text-sm text-slate-500">
          Bygg din egen arbeidsflyt. Opprett, flytt, gi nytt navn og slett steg,
          og plasser kundene slik det passer din måte å jobbe på.
        </p>
      </div>
      <CustomerJourneyBoard
        initialCustomers={rows}
        initialStatuses={(statuses as JourneyStage[]) ?? []}
        userId={user.id}
      />
    </div>
  );
}
