import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Commission, Profile } from "@/lib/types";
import RegnskapView, { type CommissionRow } from "@/components/RegnskapView";

export const dynamic = "force-dynamic";

// Regnskap/provisjon – oversikt over alle salg, fakturert/betalt-status og
// provisjon. Kun ledere.
export default async function RegnskapPage() {
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

  const { data } = await supabase
    .from("commissions")
    .select(
      "*, customer:customers(name, org_number), agent:profiles(full_name)",
    )
    .order("created_at", { ascending: false });

  type Joined = Commission & {
    customer: { name: string | null; org_number: string | null } | null;
    agent: { full_name: string | null } | null;
  };

  const rows: CommissionRow[] = ((data ?? []) as Joined[]).map((r) => ({
    id: r.id,
    deal_id: r.deal_id,
    agent_id: r.agent_id,
    customer_id: r.customer_id,
    sale_amount: Number(r.sale_amount),
    commission_rate: Number(r.commission_rate),
    commission_amount: Number(r.commission_amount),
    status: r.status,
    fiken_invoice_id: r.fiken_invoice_id,
    invoiced_at: r.invoiced_at,
    paid_at: r.paid_at,
    created_at: r.created_at,
    customer_name: r.customer?.name ?? null,
    customer_org: r.customer?.org_number ?? null,
    agent_name: r.agent?.full_name ?? null,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Regnskap</h1>
        <p className="text-sm text-slate-500">
          Oversikt over salg, fakturering og provisjon – synkronisert med Fiken.
        </p>
      </div>
      <RegnskapView rows={rows} />
    </div>
  );
}
