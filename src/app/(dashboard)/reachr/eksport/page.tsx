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

  const [{ data: leads }, { data: profiles }] = await Promise.all([
    supabase.from("reachr_leads").select("owner_id, status"),
    supabase.from("profiles").select("id, full_name").eq("role", "agent"),
  ]);

  type LeadRow = { owner_id: string; status: string };
  const rows = (leads as LeadRow[]) ?? [];

  // Aggreger per selger: totalt eksportert + hvor mange som ble kunde.
  const byOwner = new Map<string, { total: number; kunde: number }>();
  for (const l of rows) {
    const agg = byOwner.get(l.owner_id) ?? { total: 0, kunde: 0 };
    agg.total += 1;
    if (l.status === "Kunde") agg.kunde += 1;
    byOwner.set(l.owner_id, agg);
  }

  const sellers = (
    (profiles as Pick<Profile, "id" | "full_name">[]) ?? []
  ).map((p) => ({
    id: p.id,
    name: p.full_name || "Ukjent",
    total: byOwner.get(p.id)?.total ?? 0,
    kunde: byOwner.get(p.id)?.kunde ?? 0,
  }));
  sellers.sort((a, b) => b.total - a.total);

  const grandTotal = sellers.reduce((s, x) => s + x.total, 0);
  const grandKunde = sellers.reduce((s, x) => s + x.kunde, 0);

  return (
    <div className="space-y-6">
      <ReachrTabs isManager />

      <div>
        <h2 className="text-xl font-bold text-slate-900">Eksport per selger</h2>
        <p className="text-sm text-slate-500">
          Antall leads hver selger har eksportert fra Reachr til CRM.
        </p>
      </div>

      <div className="card overflow-x-auto p-0 thin-scroll">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="label-eyebrow px-4 py-2.5 font-semibold">Selger</th>
              <th className="label-eyebrow px-4 py-2.5 text-right font-semibold">
                Eksportert til CRM
              </th>
              <th className="label-eyebrow px-4 py-2.5 text-right font-semibold">
                Hvorav kunde
              </th>
            </tr>
          </thead>
          <tbody>
            {sellers.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
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
                <td className="px-4 py-2.5 text-right">{grandKunde}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
