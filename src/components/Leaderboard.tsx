"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LeaderboardRow, Profile } from "@/lib/types";
import { PERIODS, PERIOD_LABELS, periodRange, type Period } from "@/lib/periods";
import { formatCurrency } from "@/lib/format";
import Avatar from "./Avatar";

// Filtrerbar ledertavle (dag/uke/måned/kvartal/år). Bruker RPC get_leaderboard.
// Navn hentes fra profiles med fallback til e-post når full_name mangler.
export default function Leaderboard() {
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>("uke");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [profiles, setProfiles] = useState<
    Record<string, { name: string; avatar_url: string | null }>
  >({});
  const [loading, setLoading] = useState(false);

  // Hent profil-info én gang for visningsnavn + avatar.
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .then(({ data }) => {
        const map: Record<string, { name: string; avatar_url: string | null }> = {};
        for (const p of (data as Pick<
          Profile,
          "id" | "full_name" | "email" | "avatar_url"
        >[]) ?? []) {
          map[p.id] = {
            name: p.full_name || p.email || "Ukjent",
            avatar_url: p.avatar_url,
          };
        }
        setProfiles(map);
      });
  }, [supabase]);

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

  function displayName(r: LeaderboardRow) {
    return profiles[r.agent_id]?.name || r.full_name || "Ukjent";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              period === p
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="divide-y divide-[#d8c9b0]/70 sm:hidden">
          {rows.map((r, i) => (
            <article key={r.agent_id} className={`p-4 ${i === 0 ? "bg-gradient-to-r from-amber-50 to-transparent" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={displayName(r)} url={profiles[r.agent_id]?.avatar_url} size={34} />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[#2b2118]">{displayName(r)}</p>
                    <p className="text-xs text-[#8b7357]">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</p>
                  </div>
                </div>
                <p className="text-right text-sm font-bold text-[#008f52]">{formatCurrency(r.sales_amount)}</p>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <MobileMetric label="Samt." value={String(r.calls_count)} />
                <MobileMetric label="Møter" value={String(r.meetings_confirmed)} />
                <MobileMetric label="Salg" value={String(r.sales_count)} />
                <MobileMetric label="Avslag" value={String(r.rejections_count)} />
              </div>
            </article>
          ))}
          {!loading && rows.length === 0 && (
            <p className="px-4 py-6 text-center text-slate-500">Ingen data for perioden.</p>
          )}
        </div>
        <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead className="label-eyebrow border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Selger</th>
              <th className="px-4 py-3 text-right">Samtaler</th>
              <th className="px-4 py-3 text-right">Bekreftede møter</th>
              <th className="px-4 py-3 text-right">Salg</th>
              <th className="px-4 py-3 text-right">Avslag</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">
                Salgsverdi
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.agent_id}
                className={`border-b border-slate-100 ${
                  i === 0 ? "bg-gradient-to-r from-amber-50 to-transparent" : ""
                }`}
              >
                <td
                  className={`px-4 py-3 font-bold ${
                    i === 0 ? "text-lg" : "text-slate-400"
                  }`}
                >
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={displayName(r)}
                      url={profiles[r.agent_id]?.avatar_url}
                      size={28}
                    />
                    <span
                      className={
                        i === 0
                          ? "font-bold text-slate-900"
                          : "font-medium text-slate-800"
                      }
                    >
                      {displayName(r)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.calls_count}
                </td>
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
    </div>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#d8c9b0] bg-[#fbf7ed] p-2">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#8b7357]">{label}</p>
      <p className="mt-1 font-bold tabular-nums text-[#2b2118]">{value}</p>
    </div>
  );
}
