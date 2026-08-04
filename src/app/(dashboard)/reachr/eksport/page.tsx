import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import ReachrTabs from "@/components/reachr/ReachrTabs";

export const dynamic = "force-dynamic";

// Leder-oversikt: hvor mange leads hver selger har eksportert fra Reachr til
// CRM (hver lagret Reachr-lead oppretter/kobler en kunde). Kun ledere.
export default async function ReachrExportPage() {
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
  if (me?.role !== "manager") redirect("/reachr/leadssok");

  const [{ data: leads }, { data: profiles }, { data: calls }] =
    await Promise.all([
      supabase.from("reachr_leads").select("owner_id, customer_id, status"),
      supabase.from("profiles").select("id, full_name").eq("role", "agent"),
      supabase
        .from("call_logs")
        .select("customer_id, agent_id")
        .not("customer_id", "is", null),
    ]);

  type LeadRow = {
    owner_id: string;
    customer_id: string | null;
    status: string;
  };
  const rows = (leads as LeadRow[]) ?? [];

  // Objektivt «ringt»: sett av «kunde|agent» som faktisk har en samtale i
  // call_logs. Da teller vi kun leads selgeren SELV har ringt – ikke leads de
  // bare har markert som kontaktet.
  const callSet = new Set<string>();
  for (const c of (calls as { customer_id: string; agent_id: string | null }[]) ??
    []) {
    if (c.customer_id && c.agent_id) callSet.add(`${c.customer_id}|${c.agent_id}`);
  }

  // Aggreger per selger: eksportert + ringt + ble kunde.
  const byOwner = new Map<
    string,
    { total: number; ringt: number; kunde: number }
  >();
  for (const l of rows) {
    const agg =
      byOwner.get(l.owner_id) ?? { total: 0, ringt: 0, kunde: 0 };
    agg.total += 1;
    if (l.customer_id && callSet.has(`${l.customer_id}|${l.owner_id}`)) {
      agg.ringt += 1;
    }
    if (l.status === "Kunde") agg.kunde += 1;
    byOwner.set(l.owner_id, agg);
  }

  const sellers = (
    (profiles as Pick<Profile, "id" | "full_name">[]) ?? []
  ).map((p) => {
    const agg = byOwner.get(p.id) ?? { total: 0, ringt: 0, kunde: 0 };
    return {
      id: p.id,
      name: p.full_name || "Ukjent",
      total: agg.total,
      ringt: agg.ringt,
      kunde: agg.kunde,
      andel: agg.total > 0 ? Math.round((agg.ringt / agg.total) * 100) : 0,
    };
  });
  sellers.sort((a, b) => b.total - a.total);

  const grandTotal = sellers.reduce((s, x) => s + x.total, 0);
  const grandRingt = sellers.reduce((s, x) => s + x.ringt, 0);
  const grandKunde = sellers.reduce((s, x) => s + x.kunde, 0);
  const grandAndel =
    grandTotal > 0 ? Math.round((grandRingt / grandTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      <ReachrTabs isManager />

      <div>
        <h2 className="text-xl font-bold text-slate-900">Eksport per selger</h2>
        <p className="text-sm text-slate-500">
          Hvor mange leads hver selger har lagt til i CRM fra Reachr – og hvor
          mange de faktisk har ringt. «Ringt» måles på reelle samtaler i
          samtaleloggen, ikke selgerens egen status.
        </p>
      </div>

      <div className="card overflow-x-auto p-0 thin-scroll">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="label-eyebrow px-4 py-2.5 font-semibold">Selger</th>
              <th className="label-eyebrow px-4 py-2.5 text-right font-semibold">
                Lagt til i CRM
              </th>
              <th className="label-eyebrow px-4 py-2.5 text-right font-semibold">
                Ringt
              </th>
              <th className="label-eyebrow px-4 py-2.5 text-right font-semibold">
                Ringt-andel
              </th>
              <th className="label-eyebrow px-4 py-2.5 text-right font-semibold">
                Ble kunde
              </th>
            </tr>
          </thead>
          <tbody>
            {sellers.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-slate-400"
                >
                  Ingen selgere å vise.
                </td>
              </tr>
            ) : (
              sellers.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800">
                    {s.name}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900">
                    {s.total}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {s.ringt}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        s.total === 0
                          ? "bg-slate-100 text-slate-400"
                          : s.andel >= 70
                            ? "bg-emerald-100 text-emerald-700"
                            : s.andel >= 40
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                      }`}
                    >
                      {s.total === 0 ? "–" : `${s.andel}%`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-700">
                    {s.kunde}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {sellers.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <td className="px-4 py-2.5">Totalt</td>
                <td className="px-4 py-2.5 text-right">{grandTotal}</td>
                <td className="px-4 py-2.5 text-right">{grandRingt}</td>
                <td className="px-4 py-2.5 text-right">{grandAndel}%</td>
                <td className="px-4 py-2.5 text-right">{grandKunde}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Tips: lav ringt-andel betyr at selgeren har lagt til leads uten å ringe
        dem. «Ringt» krever at telefoni (Bria) er koblet på, ellers står den på 0.
      </p>
    </div>
  );
}
