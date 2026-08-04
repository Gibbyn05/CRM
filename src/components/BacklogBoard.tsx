"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Deal } from "@/lib/types";
import { DEAL_STAGES, DEAL_STAGE_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import Icon from "./Icon";

export interface StuckDeal extends Deal {
  customer_name: string;
  owner_name: string | null;
}

const THRESHOLDS = [3, 7, 14, 30] as const;

const STAGE_BADGE: Record<string, string> = {
  ringt: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  tilbud_sendt: "bg-amber-50 text-amber-700 ring-amber-200",
  akseptert: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

// Viser åpne avtaler (alle steg utenom «tapt») som ikke har flyttet seg på
// et gitt antall dager, gruppert pr. steg og sortert på lengst fastkjørt
// først – slik at ledere raskt ser hvilke kundereiser trenger et puff.
export default function BacklogBoard({ deals }: { deals: StuckDeal[] }) {
  const [threshold, setThreshold] = useState<number>(14);

  const stuck = useMemo(
    () =>
      deals
        .map((d) => ({ ...d, days: daysSince(d.updated_at) }))
        .filter((d) => d.days >= threshold)
        .sort((a, b) => b.days - a.days),
    [deals, threshold],
  );

  const byStage = useMemo(() => {
    const map = new Map<string, (StuckDeal & { days: number })[]>();
    for (const stage of DEAL_STAGES) {
      if (stage === "tapt") continue;
      map.set(
        stage,
        stuck.filter((d) => d.stage === stage),
      );
    }
    return map;
  }, [stuck]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Vis avtaler fast i mer enn</span>
        <select
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {THRESHOLDS.map((t) => (
            <option key={t} value={t}>
              {t} dager
            </option>
          ))}
        </select>
      </div>

      {stuck.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Ingen avtaler har stått fast i mer enn {threshold} dager. 🎉
        </div>
      )}

      {Array.from(byStage.entries()).map(([stage, stageDeals]) =>
        stageDeals.length === 0 ? null : (
          <div key={stage} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h2 className="font-bold text-slate-800">
                {DEAL_STAGE_LABELS[stage as Deal["stage"]]}
              </h2>
              <span className="text-xs font-medium text-slate-500">
                {stageDeals.length}{" "}
                {stageDeals.length === 1 ? "avtale" : "avtaler"}
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="label-eyebrow border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2">Kunde / avtale</th>
                  <th className="hidden px-4 py-2 sm:table-cell">Selger</th>
                  <th className="hidden px-4 py-2 md:table-cell">Verdi</th>
                  <th className="px-4 py-2">Fast siden</th>
                </tr>
              </thead>
              <tbody>
                {stageDeals.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${d.customer_id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {d.customer_name}
                      </Link>
                      <p className="text-xs text-slate-500">{d.title}</p>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                      {d.owner_name ?? "–"}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-slate-600 md:table-cell">
                      {formatCurrency(d.amount, d.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          STAGE_BADGE[stage] ?? "bg-slate-50 text-slate-700 ring-slate-200"
                        }`}
                      >
                        <Icon name="flag" size={12} />
                        {d.days} dager
                      </span>
                      <p className="mt-1 text-xs text-slate-400">
                        siden {formatDate(d.updated_at)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}
