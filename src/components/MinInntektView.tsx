"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CommissionStatus } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  getPaymentStatus,
  type PaymentStatus,
} from "@/lib/payment-status";

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
  due_at: string | null;
  created_at: string;
  customer_name: string | null;
  agent_name: string | null;
}

const PAYMENT_META: Record<
  PaymentStatus,
  {
    label: string;
    description: string;
    badge: string;
    row: string;
    dot: string;
  }
> = {
  paid: {
    label: "Betalt",
    description: "Betalingen er registrert",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    row: "border-l-emerald-500 bg-emerald-50/30",
    dot: "bg-emerald-500",
  },
  unpaid: {
    label: "Ikke betalt",
    description: "Betaling mangler",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    row: "border-l-amber-400 bg-amber-50/20",
    dot: "bg-amber-500",
  },
  overdue: {
    label: "Over forfall",
    description: "Fristen er passert",
    badge: "border-red-200 bg-red-50 text-red-800",
    row: "border-l-red-500 bg-red-50/30",
    dot: "bg-red-500",
  },
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
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "all">(
    "all",
  );
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

  const periodRows = useMemo(() => {
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

  const filtered = useMemo(
    () =>
      periodRows.filter(
        (row) =>
          paymentFilter === "all" || getPaymentStatus(row) === paymentFilter,
      ),
    [periodRows, paymentFilter],
  );

  // Nøkkeltall på PROVISJON (det selgeren faktisk tjener).
  const kpis = useMemo(() => {
    const bucket = (status: PaymentStatus) => {
      const matches = periodRows.filter((row) => getPaymentStatus(row) === status);
      return {
        amount: matches.reduce((sum, row) => sum + row.commission_amount, 0),
        count: matches.length,
      };
    };
    return {
      paid: bucket("paid"),
      unpaid: bucket("unpaid"),
      overdue: bucket("overdue"),
    };
  }, [periodRows]);

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

      {/* Betalingsoversikt. Kortene fungerer også som raske filtre. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          status="paid"
          value={kpis.paid.amount}
          count={kpis.paid.count}
          active={paymentFilter === "paid"}
          onClick={() => setPaymentFilter((value) => (value === "paid" ? "all" : "paid"))}
        />
        <Kpi
          status="unpaid"
          value={kpis.unpaid.amount}
          count={kpis.unpaid.count}
          active={paymentFilter === "unpaid"}
          onClick={() => setPaymentFilter((value) => (value === "unpaid" ? "all" : "unpaid"))}
        />
        <Kpi
          status="overdue"
          value={kpis.overdue.amount}
          count={kpis.overdue.count}
          active={paymentFilter === "overdue"}
          onClick={() => setPaymentFilter((value) => (value === "overdue" ? "all" : "overdue"))}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Beløpene viser provisjon. Bare betalinger registrert som betalt regnes
          som gjennomført.
        </p>
        {paymentFilter !== "all" && (
          <button
            type="button"
            onClick={() => setPaymentFilter("all")}
            className="text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900"
          >
            Vis alle betalinger
          </button>
        )}
      </div>

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
                const paymentStatus = getPaymentStatus(r);
                const meta = PAYMENT_META[paymentStatus];
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-l-[3px] border-b-slate-100 last:border-b-0 hover:brightness-[0.985] ${meta.row}`}
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
                        paymentStatus === "paid"
                          ? "text-emerald-700"
                          : paymentStatus === "overdue"
                            ? "text-red-700"
                            : "text-slate-800"
                      }`}
                    >
                      {formatCurrency(r.commission_amount)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-bold ${meta.badge}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {meta.description}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      <PaymentDate row={r} status={paymentStatus} />
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
  status,
  value,
  count,
  active,
  onClick,
}: {
  status: PaymentStatus;
  value: number;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const meta = PAYMENT_META[status];
  const tones: Record<PaymentStatus, string> = {
    paid: "border-emerald-200 bg-emerald-50/60 text-emerald-900",
    unpaid: "border-amber-200 bg-amber-50/60 text-amber-950",
    overdue: "border-red-200 bg-red-50/60 text-red-950",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${tones[status]} ${
        active ? "ring-2 ring-current ring-offset-2" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.14em]">
          {meta.label}
        </p>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">
          {count}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">
        {formatCurrency(value)}
      </p>
      <p className="mt-0.5 text-xs opacity-70">{meta.description}</p>
    </button>
  );
}

function PaymentDate({
  row,
  status,
}: {
  row: IncomeRow;
  status: PaymentStatus;
}) {
  if (status === "paid") {
    return (
      <>
        <div className="font-medium text-emerald-800">
          {formatDate(row.paid_at)}
        </div>
        <div className="text-[11px] text-slate-400">Betalingsdato</div>
      </>
    );
  }
  if (row.due_at) {
    return (
      <>
        <div className={status === "overdue" ? "font-semibold text-red-700" : "font-medium"}>
          {formatDate(row.due_at)}
        </div>
        <div className="text-[11px] text-slate-400">Betalingsfrist</div>
      </>
    );
  }
  return (
    <>
      <div>{formatDate(row.invoiced_at ?? row.created_at)}</div>
      <div className="text-[11px] text-slate-400">
        {row.invoiced_at ? "Fakturert" : "Registrert"}
      </div>
    </>
  );
}
