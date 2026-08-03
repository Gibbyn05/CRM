import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DealStage } from "@/lib/types";
import Icon from "@/components/Icon";
import OffersList, { type OfferRow } from "@/components/OffersList";

export const dynamic = "force-dynamic";

// Salg-landing: start et nytt salg + oversikt over tidligere sendte tilbud.
export default async function SalgPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Alle tidligere sendte tilbud (opprettet via veiviseren = offer_sent_at satt).
  const { data } = await supabase
    .from("deals")
    .select(
      "id, title, amount, stage, offer_sent_at, created_at, customer_id, customer:customers(name), agent:profiles(full_name), deal_items(count)",
    )
    .not("offer_sent_at", "is", null)
    .order("offer_sent_at", { ascending: false });

  type Joined = {
    id: string;
    title: string;
    amount: number | null;
    stage: DealStage;
    offer_sent_at: string | null;
    created_at: string;
    customer_id: string;
    customer: { name: string | null } | { name: string | null }[] | null;
    agent: { full_name: string | null } | { full_name: string | null }[] | null;
    deal_items: { count: number }[] | null;
  };

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? v[0] ?? null : v;

  const rows: OfferRow[] = ((data ?? []) as Joined[]).map((d) => ({
    id: d.id,
    title: d.title,
    amount: d.amount != null ? Number(d.amount) : null,
    stage: d.stage,
    offer_sent_at: d.offer_sent_at,
    customer_id: d.customer_id,
    customer_name: one(d.customer)?.name ?? null,
    agent_name: one(d.agent)?.full_name ?? null,
    item_count: d.deal_items?.[0]?.count ?? 0,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salg</h1>
          <p className="text-sm text-slate-500">
            Tidligere sendte tilbud. Lag et nytt tilbud fra katalogen.
          </p>
        </div>
        <Link
          href="/salg/ny"
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Icon name="plus" size={16} />
          Nytt salg
        </Link>
      </div>

      <OffersList rows={rows} />
    </div>
  );
}
