"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CommissionStatus } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import Icon from "./Icon";

export interface CommissionRow {
  id: string;
  deal_id: string;
  agent_id: string | null;
  customer_id: string | null;
  sale_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: CommissionStatus;
  fiken_invoice_id: number | null;
  invoiced_at: string | null;
  paid_at: string | null;
  created_at: string;
  customer_name: string | null;
  customer_org: string | null;
  agent_name: string | null;
}

const STATUS_META: Record<
  CommissionStatus,
  { label: string; badge: string }
> = {
  ikke_fakturert: {
    label: "Ikke fakturert",
    badge: "bg-slate-100 text-slate-600",
  },
  fakturert: { label: "Fakturert", badge: "bg-amber-100 text-amber-700" },
  betalt: { label: "Betalt", badge: "bg-emerald-100 text-emerald-700" },
  forfalt: { label: "Forfalt", badge: "bg-red-100 text-red-700" },
  avskrevet: { label: "Avskrevet", badge: "bg-slate-200 text-slate-500" },
};

export default function RegnskapView({ rows }: { rows: CommissionRow[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | "alle">(
    "alle",
  );
  const [sellerFilter, setSellerFilter] = useState<string>("alle");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Selgere som forekommer i dataene (til filteret).
  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.agent_id) map.set(r.agent_id, r.agent_name ?? "Ukjent");
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "alle" && r.status !== statusFilter) return false;
      if (sellerFilter !== "alle" && r.agent_id !== sellerFilter) return false;
      const day = r.created_at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [rows, statusFilter, sellerFilter, from, to]);

  // KPI-er beregnet fra det filtrerte utvalget.
  const kpis = useMemo(() => {
    const bucket = (pred: (r: CommissionRow) => boolean) => {
      const list = filtered.filter(pred);
      return {
        sum: list.reduce((s, r) => s + r.sale_amount, 0),
        count: list.length,
      };
    };
    return {
      solgt: bucket((r) => r.status !== "avskrevet"),
      ikkeFakturert: bucket((r) => r.status === "ikke_fakturert"),
      fakturert: bucket((r) => r.status === "fakturert"),
      betalt: bucket((r) => r.status === "betalt"),
      forfalt: bucket((r) => r.status === "forfalt"),
    };
  }, [filtered]);

  const provisjonSum = filtered.reduce((s, r) => s + r.commission_amount, 0);

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/regnskap/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setSyncMsg(json.error ?? "Synkronisering feilet.");
      } else if (json.skipped) {
        setSyncMsg("Fiken er ikke koblet til ennå (mangler API-nøkkel).");
      } else {
        setSyncMsg(
          `Synkronisert: ${json.updated} oppdatert av ${json.checked} fakturerte.`,
        );
        router.refresh();
      }
    } catch {
      setSyncMsg("Synkronisering feilet.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* KPI-kort */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Solgt totalt" sum={kpis.solgt.sum} count={kpis.solgt.count} />
        <Kpi
          label="Ikke fakturert"
          sum={kpis.ikkeFakturert.sum}
          count={kpis.ikkeFakturert.count}
        />
        <Kpi
          label="Fakturert"
          sum={kpis.fakturert.sum}
          count={kpis.fakturert.count}
          accent="text-amber-600"
        />
        <Kpi
          label="Betalt"
          sum={kpis.betalt.sum}
          count={kpis.betalt.count}
          accent="text-emerald-600"
        />
        <Kpi
          label="Forfalt"
          sum={kpis.forfalt.sum}
          count={kpis.forfalt.count}
          accent="text-red-600"
        />
      </div>

      {/* Verktøylinje: filtre + synk */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-500">
            Status
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as CommissionStatus | "alle")
              }
              className={selectCls}
            >
              <option value="alle">Alle</option>
              {(Object.keys(STATUS_META) as CommissionStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Selger
            <select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              className={selectCls}
            >
              <option value="alle">Alle</option>
              {sellers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Fra
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={selectCls}
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Til
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={selectCls}
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          {syncMsg && (
            <span className="text-xs text-slate-500">{syncMsg}</span>
          )}
          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <Icon name="upload" size={16} />
            {syncing ? "Synkroniserer …" : "Synkroniser med Fiken"}
          </button>
        </div>
      </div>

      {/* Tabell */}
      <div className="card overflow-x-auto p-0 thin-scroll">
        <table className="min-w-[52rem] w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <Th>Kunde</Th>
              <Th>Selger</Th>
              <Th className="text-right">Beløp</Th>
              <Th className="text-right">Provisjon</Th>
              <Th>Status</Th>
              <Th>Fakturert</Th>
              <Th>Betalt</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-slate-400"
                >
                  Ingen salg å vise ennå. Vunne salg fra pipelinen dukker opp
                  her.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
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
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.agent_name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                    {formatCurrency(r.sale_amount)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">
                    {formatCurrency(r.commission_amount)}
                    <span className="ml-1 text-2xs text-slate-400">
                      ({Math.round(r.commission_rate * 100)}%)
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${STATUS_META[r.status].badge}`}
                    >
                      {STATUS_META[r.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {formatDate(r.invoiced_at)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {formatDate(r.paid_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <td className="px-4 py-2.5" colSpan={2}>
                  Sum ({filtered.length})
                </td>
                <td className="px-4 py-2.5 text-right">
                  {formatCurrency(kpis.solgt.sum)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {formatCurrency(provisjonSum)}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Kpi({
  label,
  sum,
  count,
  accent = "text-slate-900",
}: {
  label: string;
  sum: number;
  count: number;
  accent?: string;
}) {
  return (
    <div className="card p-4">
      <p className="label-eyebrow">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent}`}>
        {formatCurrency(sum)}
      </p>
      <p className="text-xs text-slate-400">{count} salg</p>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-2.5 label-eyebrow font-semibold ${className}`}>
      {children}
    </th>
  );
}

const selectCls =
  "mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
