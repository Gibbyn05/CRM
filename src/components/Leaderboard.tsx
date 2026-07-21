"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LeaderboardRow } from "@/lib/types";
import { PERIODS, PERIOD_LABELS, periodRange, type Period } from "@/lib/periods";
import { formatCurrency } from "@/lib/format";

// Filtrerbar ledertavle (dag/uke/måned/kvartal/år). Bruker RPC get_leaderboard.
export default function Leaderboard() {
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>("uke");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [start, end] = periodRange(period);
      const { data } = await supabase.rpc("get_leaderboard", {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      });
      if (active) {
        setRows((data as LeaderboardRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [period, supabase]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              period === p
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Selger</th>
              <th className="px-4 py-3 text-right">Samtaler</th>
              <th className="px-4 py-3 text-right">Bekreftede møter</th>
              <th className="px-4 py-3 text-right">Salg</th>
              <th className="px-4 py-3 text-right">Avslag</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">Salgsverdi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.agent_id} className="border-b border-slate-100">
                <td className="px-4 py-3 font-bold text-slate-400">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {r.full_name}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.calls_count}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.meetings_confirmed}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-green-700">
                  {r.sales_count}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-red-600">
                  {r.rejections_count}
                </td>
                <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                  {formatCurrency(r.sales_amount)}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  Ingen data for perioden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
