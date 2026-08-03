"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DealStage } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

export interface OfferRow {
  id: string;
  title: string;
  amount: number | null;
  stage: DealStage;
  offer_sent_at: string | null;
  customer_id: string;
  customer_name: string | null;
  agent_name: string | null;
  item_count: number;
}

const STAGE_META: Record<DealStage, { label: string; badge: string }> = {
  ringt: { label: "Ringt", badge: "bg-slate-100 text-slate-600" },
  tilbud_sendt: { label: "Tilbud sendt", badge: "bg-amber-100 text-amber-700" },
  akseptert: { label: "Akseptert", badge: "bg-emerald-100 text-emerald-700" },
  tapt: { label: "Tapt", badge: "bg-red-100 text-red-700" },
};

export default function OffersList({ rows }: { rows: OfferRow[] }) {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<DealStage | "alle">("alle");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stage !== "alle" && r.stage !== stage) return false;
      if (
        q &&
        !(r.customer_name ?? "").toLowerCase().includes(q) &&
        !r.title.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [rows, search, stage]);

  const total = filtered.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Filtre */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søk etter kunde eller tittel …"
          className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value as DealStage | "alle")}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="alle">Alle statuser</option>
          {(Object.keys(STAGE_META) as DealStage[]).map((s) => (
            <option key={s} value={s}>
              {STAGE_META[s].label}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto p-0 thin-scroll">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="label-eyebrow px-4 py-2.5 font-semibold">Kunde</th>
              <th className="label-eyebrow px-4 py-2.5 font-semibold">Tittel</th>
              <th className="label-eyebrow px-4 py-2.5 font-semibold">Selger</th>
              <th className="label-eyebrow px-4 py-2.5 text-center font-semibold">
                Prod.
              </th>
              <th className="label-eyebrow px-4 py-2.5 text-right font-semibold">
                Beløp
              </th>
              <th className="label-eyebrow px-4 py-2.5 font-semibold">Status</th>
              <th className="label-eyebrow px-4 py-2.5 font-semibold">Sendt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-slate-400"
                >
                  Ingen tilbud ennå. Trykk «Nytt salg» for å lage det første.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/customers/${r.customer_id}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {r.customer_name ?? "Ukjent kunde"}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{r.title}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.agent_name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-500">
                    {r.item_count}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                    {formatCurrency(r.amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${STAGE_META[r.stage].badge}`}
                    >
                      {STAGE_META[r.stage].label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {formatDate(r.offer_sent_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <td className="px-4 py-2.5" colSpan={4}>
                  Sum ({filtered.length})
                </td>
                <td className="px-4 py-2.5 text-right">
                  {formatCurrency(total)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
