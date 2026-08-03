"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CommissionStatus } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";

export interface IncomeRow {
  id: string;
  agent_id: string | null;
  customer_id: string | null;
  sale_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: CommissionStatus;
  invoiced_at: string | null;
  paid_at: string | null;
  created_at: string;
  customer_name: string | null;
  agent_name: string | null;
}

const STATUS_META: Record<CommissionStatus, { label: string; badge: string }> =
  {
    ikke_fakturert: {
      label: "Ikke fakturert",
      badge: "bg-slate-100 text-slate-600",
    },
    fakturert: { label: "Fakturert", badge: "bg-amber-100 text-amber-700" },
    betalt: { label: "Betalt", badge: "bg-emerald-100 text-emerald-700" },
    forfalt: { label: "Forfalt", badge: "bg-red-100 text-red-700" },
    avskrevet: { label: "Avskrevet", badge: "bg-slate-200 text-slate-500" },
  };

export default function MinInntektView({
  rows,
  isManager,
  currentUserId,
}: {
  rows: IncomeRow[];
  isManager: boolean;
  currentUserId: string;
}) {
  const [period, setPeriod] = useState<"maaned" | "totalt">("totalt");
  // Ledere kan velge selger; selgere ser bare egne (RLS gir uansett kun egne).
  const [sellerFilter, setSellerFilter] = useState<string>(
    isManager ? "alle" : currentUserId,
  );

  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.agent_id) map.set(r.agent_id, r.agent_name ?? "Ukjent");
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (isManager && sellerFilter !== "alle" && r.agent_id !== sellerFilter)
        return false;
      if (period === "maaned") {
        // «Denne måneden» baseres på når salget ble opprettet.
        if (r.created_at.slice(0, 10) < monthStart) return false;
      }
      return true;
    });
  }, [rows, isManager, sellerFilter, period, monthStart]);

  // Nøkkeltall på PROVISJON (det selgeren faktisk tjener).
  const kpis = useMemo(() => {
    const sum = (pred: (r: IncomeRow) => boolean) =>
      filtered.filter(pred).reduce((s, r) => s + r.commission_amount, 0);
    return {
      opptjent: sum((r) => r.status === "betalt"),
      venter: sum((r) => r.status === "fakturert" || r.status === "forfalt"),
      ikkeFakturert: sum((r) => r.status === "ikke_fakturert"),
    };
  }, [filtered]);

  return (
    <div className="space-y-5">
      {/* Periode + (leder) selgervelger */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ["totalt", "Totalt"],
              ["maaned", "Denne måneden"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setPeriod(v)}
              aria-pressed={period === v}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                period === v
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isManager && (
          <label className="text-xs font-medium text-slate-500">
            Selger{" "}
            <select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              className="ml-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="alle">Alle</option>
              {sellers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* KPI-kort (provisjon) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Opptjent"
          value={kpis.opptjent}
          accent="text-emerald-600"
          hint="Kunden har betalt"
        />
        <Kpi
          label="Venter på betaling"
          value={kpis.venter}
          accent="text-amber-600"
          hint="Fakturert, ikke betalt"
        />
        <Kpi
          label="Ikke fakturert"
          value={kpis.ikkeFakturert}
          accent="text-slate-700"
          hint="Vunnet, ikke fakturert"
        />
      </div>

      <p className="text-xs text-slate-400">
        Provisjon utbetales når kunden har betalt. «Opptjent» er derfor det som
        er reelt tjent.
      </p>

      {/* Tabell */}
      <div className="card overflow-x-auto p-0 thin-scroll">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="label-eyebrow px-4 py-2.5 font-semibold">Kunde</th>
              {isManager && (
                <th className="label-eyebrow px-4 py-2.5 font-semibold">
                  Selger
                </th>
              )}
              <th className="label-eyebrow px-4 py-2.5 text-right font-semibold">
                Beløp
              </th>
              <th className="label-eyebrow px-4 py-2.5 text-right font-semibold">
                Provisjon
              </th>
              <th className="label-eyebrow px-4 py-2.5 font-semibold">Status</th>
              <th className="label-eyebrow px-4 py-2.5 font-semibold">Dato</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={isManager ? 6 : 5}
                  className="px-4 py-10 text-center text-sm text-slate-400"
                >
                  Ingen salg i denne perioden ennå.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const paid = r.status === "betalt";
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/60 ${
                      paid ? "bg-emerald-50/40" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      {r.customer_id ? (
                        <Link
                          href={`/customers/${r.customer_id}`}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          {r.customer_name ?? "Ukjent kunde"}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-700">
                          {r.customer_name ?? "Ukjent kunde"}
                        </span>
                      )}
                    </td>
                    {isManager && (
                      <td className="px-4 py-2.5 text-slate-600">
                        {r.agent_name ?? "—"}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {formatCurrency(r.sale_amount)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-semibold ${
                        paid ? "text-emerald-700" : "text-slate-800"
                      }`}
                    >
                      {formatCurrency(r.commission_amount)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${STATUS_META[r.status].badge}`}
                      >
                        {STATUS_META[r.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {formatDate(r.paid_at ?? r.invoiced_at ?? r.created_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent: string;
  hint: string;
}) {
  return (
    <div className="card p-4">
      <p className="label-eyebrow">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>
        {formatCurrency(value)}
      </p>
      <p className="text-xs text-slate-400">{hint}</p>
    </div>
  );
}
