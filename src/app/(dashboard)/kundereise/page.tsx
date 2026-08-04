import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CustomerStatus, Profile } from "@/lib/types";
import CustomerJourneyBoard, {
  type JourneyCustomer,
} from "@/components/CustomerJourneyBoard";

export const dynamic = "force-dynamic";

// «Kundereise» – kanban som pipelinen, men med lederens egne, redigerbare
// statuser (customer_statuses). Kunder flyttes mellom stegene. Kun ledere.
export default async function KundereisePage() {
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

  const [{ data: statuses }, { data: customers }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("customer_statuses")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("customers")
        .select("id, name, org_number, status_id, owner_id")
        .order("name", { ascending: true }),
      supabase.from("profiles").select("id, full_name"),
    ]);

  const ownerMap = new Map(
    ((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

  const rows: JourneyCustomer[] = (
    (customers as {
      id: string;
      name: string;
      org_number: string | null;
      status_id: string | null;
      owner_id: string | null;
    }[]) ?? []
  ).map((c) => ({
    id: c.id,
    name: c.name,
    org_number: c.org_number,
    status_id: c.status_id,
    owner_name: c.owner_id ? ownerMap.get(c.owner_id) ?? null : null,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kundereise</h1>
        <p className="text-sm text-slate-500">
          Neste steg etter pipelinen. Flytt kunder mellom dine egne statuser –
          rediger titler og farger som du vil. Kun synlig for ledere.
        </p>
      </div>
      <CustomerJourneyBoard
        initialCustomers={rows}
        initialStatuses={(statuses as CustomerStatus[]) ?? []}
      />
    </div>
  );
}
