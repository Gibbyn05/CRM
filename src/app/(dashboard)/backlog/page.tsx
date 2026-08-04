import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Deal, Profile } from "@/lib/types";
import BacklogBoard, { type StuckDeal } from "@/components/BacklogBoard";

export const dynamic = "force-dynamic";

// «Backlog» – avtaler som har stått fast i samme pipeline-steg for lenge.
// Kun ledere: gir oversikt på tvers av alle selgere over kundereiser som
// trenger oppfølging, ikke bare egne.
export default async function BacklogPage() {
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

  const [{ data: deals }, { data: customers }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("deals")
        .select("*")
        .neq("stage", "tapt")
        .order("updated_at", { ascending: true }),
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

  const stuckDeals: StuckDeal[] = ((deals as Deal[]) ?? []).map((d) => ({
    ...d,
    customer_name: nameMap.get(d.customer_id) ?? "Ukjent kunde",
    owner_name: d.agent_id ? ownerMap.get(d.agent_id) ?? null : null,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Backlog – kundereise
        </h1>
        <p className="text-sm text-slate-500">
          Åpne avtaler som har stått i samme steg for lenge, på tvers av alle
          selgere. Kun synlig for ledere.
        </p>
      </div>
      <BacklogBoard deals={stuckDeals} />
    </div>
  );
}
