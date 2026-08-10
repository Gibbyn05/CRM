import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Commission, Profile } from "@/lib/types";
import MinInntektView, {
  type IncomeRow,
} from "@/components/MinInntektView";

export const dynamic = "force-dynamic";

// «Min inntekt» – selgerens egne salg og provisjon. RLS sørger for at selgere
// kun ser egne rader; ledere ser alle og kan filtrere på selger.
export default async function MinInntektPage() {
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
  const isManager = me?.role === "manager";

  const { data } = await supabase
    .from("commissions")
    .select("*, customer:customers(name), agent:profiles(full_name)")
    .order("created_at", { ascending: false });

  type Joined = Commission & {
    customer: { name: string | null } | null;
    agent: { full_name: string | null } | null;
  };

  const rows: IncomeRow[] = ((data ?? []) as Joined[]).map((r) => ({
    id: r.id,
    agent_id: r.agent_id,
    customer_id: r.customer_id,
    sale_amount: Number(r.sale_amount),
    commission_rate: Number(r.commission_rate),
    commission_amount: Number(r.commission_amount),
    status: r.status,
    invoiced_at: r.invoiced_at,
    paid_at: r.paid_at,
    due_at: r.due_at,
    created_at: r.created_at,
    customer_name: r.customer?.name ?? null,
    agent_name: r.agent?.full_name ?? null,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Min inntekt</h1>
        <p className="text-sm text-slate-500">
          Dine salg og provisjon. Provisjon utbetales når kunden har betalt.
        </p>
      </div>
      <MinInntektView
        rows={rows}
        isManager={isManager}
        currentUserId={user.id}
      />
    </div>
  );
}
