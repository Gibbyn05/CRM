"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { CallDirection, CallStatus } from "@/lib/types";
import { PERIODS, PERIOD_LABELS, periodRange, type Period } from "@/lib/periods";
import {
  PERIOD_TRUNC,
  bucketLabel,
  CALL_STATUS_LABELS,
  CALL_STATUS_STYLES,
  CALL_DIRECTION_LABELS,
  type AgentStats,
  type CallBucket,
} from "@/lib/dashboard";
import { formatCurrency, timeAgo } from "@/lib/format";
import Icon, { type IconName } from "./Icon";
import Avatar from "./Avatar";

interface RecentCall {
  id: string;
  agent_id: string | null;
  customer_id: string | null;
  phone_number: string | null;
  direction: CallDirection;
  status: CallStatus;
  started_at: string | null;
  duration_seconds: number | null;
  customers: { name: string } | null;
}

// Personlig (selger) eller team-dashbord (leder). Nøkkeltall for valgt periode,
// en søylegraf over antall samtaler, og en "Sist ringt"-liste som oppdateres i
// sanntid ettersom nye samtaler logges.
export default function DashboardView({
  isManager,
  userId,
  agentNames,
}: {
  isManager: boolean;
  userId: string;
  agentNames: Record<string, string>;
}) {
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>("dag");
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [buckets, setBuckets] = useState<CallBucket[]>([]);
  const [recent, setRecent] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);

  // Refs slik at realtime-lytteren alltid bruker gjeldende periode.
  const periodRef = useRef(period);
  useEffect(() => {
    periodRef.current = period;
  }, [period]);

  const reload = useCallback(async () => {
    const p = periodRef.current;
    const [start, end] = periodRange(p);
    const trunc = PERIOD_TRUNC[p];
    // p_agent_id = null: funksjonen tvinger selgere til egne tall, og gir
    // ledere hele teamet.
    const [statsRes, bucketRes, recentRes] = await Promise.all([
      supabase.rpc("get_agent_stats", {
        p_agent_id: null,
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      }),
      supabase.rpc("get_call_buckets", {
        p_agent_id: null,
        p_start: start.toISOString(),
        p_end: end.toISOString(),
        p_trunc: trunc,
      }),
      supabase
        .from("call_logs")
        .select(
          "id, agent_id, customer_id, phone_number, direction, status, started_at, duration_seconds, customers(name)",
        )
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(12),
    ]);

    const s = (statsRes.data as AgentStats[] | null)?.[0] ?? {
      calls_count: 0,
      meetings_confirmed: 0,
      sales_count: 0,
      rejections_count: 0,
      sales_amount: 0,
    };
    setStats(s);
    setBuckets((bucketRes.data as CallBucket[]) ?? []);
    setRecent((recentRes.data as unknown as RecentCall[]) ?? []);
    setLoading(false);
  }, [supabase]);

  // Last på nytt når perioden endres.
  useEffect(() => {
    setLoading(true);
    reload();
  }, [period, reload]);

  // Realtime: oppdater dashbordet ettersom samtaler logges/endres.
  useEffect(() => {
    const debounced = (() => {
      let t: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => reload(), 400);
      };
    })();

    const channel = supabase
      .channel("dashboard_calls")
      .on(
        "postgres_changes",
        isManager
          ? { event: "*", schema: "public", table: "call_logs" }
          : {
              event: "*",
              schema: "public",
              table: "call_logs",
              filter: `agent_id=eq.${userId}`,
            },
        () => debounced(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, isManager, userId, reload]);

  const maxCalls = Math.max(1, ...buckets.map((b) => b.calls));

  return (
    <div className="space-y-6">
      {/* Topp: tittel + periodevelger */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashbord</h1>
          <p className="text-sm text-slate-500">
            {isManager
              ? "Nøkkeltall for hele teamet"
              : "Dine nøkkeltall og aktivitet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white p-1 shadow-card ring-1 ring-slate-200/70">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-xl px-3.5 py-1.5 text-sm font-medium transition ${
                period === p
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI-kort */}
      <div
        className={`grid grid-cols-2 gap-3 transition-opacity duration-300 sm:gap-4 lg:grid-cols-4 ${
          loading ? "opacity-50" : "opacity-100"
        }`}
      >
        <StatCard
          label="Ringt"
          value={stats?.calls_count ?? 0}
          icon="phone"
          tint="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Bekreftede møter"
          value={stats?.meetings_confirmed ?? 0}
          icon="calendar"
          tint="bg-sky-50 text-sky-600"
        />
        <StatCard
          label="Salg"
          value={stats?.sales_count ?? 0}
          icon="check"
          tint="bg-emerald-50 text-emerald-600"
          sub={
            stats && stats.sales_amount > 0
              ? formatCurrency(stats.sales_amount)
              : undefined
          }
        />
        <StatCard
          label="Avslag"
          value={stats?.rejections_count ?? 0}
          icon="phone-off"
          tint="bg-red-50 text-red-500"
        />
      </div>

      {/* Søylegraf: antall samtaler per periode */}
      <div
        className={`card p-5 transition-opacity duration-300 ${
          loading ? "opacity-50" : "opacity-100"
        }`}
      >
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Samtaler</h2>
            <p className="text-sm text-slate-500">
              {isManager ? "Hele teamet" : "Dine samtaler"} · {PERIOD_LABELS[period]}
            </p>
          </div>
          <p className="text-3xl font-bold text-slate-900 tabular-nums">
            {stats?.calls_count ?? 0}
          </p>
        </div>

        <div className="mt-4 overflow-x-auto thin-scroll">
          <div className="flex h-48 items-end gap-1.5">
          {buckets.length === 0 && (
            <p className="m-auto text-sm text-slate-400">
              Ingen samtaledata for perioden.
            </p>
          )}
          {buckets.map((b) => {
            const h = Math.round((b.calls / maxCalls) * 100);
            return (
              <div
                key={b.bucket}
                className="group flex min-w-[18px] flex-1 flex-col items-center gap-1.5"
                title={`${b.calls} samtaler`}
              >
                <div className="flex h-40 w-full items-end justify-center rounded-md bg-slate-50">
                  <div
                    className="w-full max-w-[26px] rounded-md bg-gradient-to-t from-brand-500 to-brand-400 transition-all group-hover:from-brand-600 group-hover:to-brand-500"
                    style={{ height: `${Math.max(b.calls > 0 ? 6 : 0, h)}%` }}
                  />
                </div>
                <span className="w-full truncate text-center text-3xs font-medium capitalize text-slate-400">
                  {bucketLabel(b.bucket, period)}
                </span>
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* Sist ringt (oppdateres i sanntid) */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Sist ringt</h2>
            <p className="text-sm text-slate-500">
              Oppdateres automatisk når nye samtaler kommer inn
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Sanntid
          </span>
        </div>

        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-left text-sm">
            <thead className="label-eyebrow border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-5 py-3">Kunde / nummer</th>
                {isManager && <th className="px-5 py-3">Selger</th>}
                <th className="hidden px-5 py-3 sm:table-cell">Retning</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Tidspunkt</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((c) => (
                <tr
                  key={c.id}
                  className="animate-row-flash border-b border-slate-50 hover:bg-slate-50"
                >
                  <td className="px-5 py-3">
                    {c.customer_id && c.customers?.name ? (
                      <Link
                        href={`/customers/${c.customer_id}`}
                        className="font-medium text-slate-800 hover:text-brand-700 hover:underline"
                      >
                        {c.customers.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-700 tabular-nums">
                        {c.phone_number ?? "Ukjent"}
                      </span>
                    )}
                  </td>
                  {isManager && (
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={
                            (c.agent_id && agentNames[c.agent_id]) || "Ukjent"
                          }
                          size={24}
                        />
                        <span className="truncate text-slate-600">
                          {(c.agent_id && agentNames[c.agent_id]) || "—"}
                        </span>
                      </div>
                    </td>
                  )}
                  <td className="hidden px-5 py-3 text-slate-500 sm:table-cell">
                    {CALL_DIRECTION_LABELS[c.direction]}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CALL_STATUS_STYLES[c.status]}`}
                    >
                      {CALL_STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-500">
                    {c.started_at ? timeAgo(c.started_at) : "–"}
                  </td>
                </tr>
              ))}
              {!loading && recent.length === 0 && (
                <tr>
                  <td
                    colSpan={isManager ? 5 : 4}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Ingen samtaler ennå. Så snart telefonen ringer, dukker de opp
                    her.
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

function StatCard({
  label,
  value,
  icon,
  tint,
  sub,
}: {
  label: string;
  value: number;
  icon: IconName;
  tint: string;
  sub?: string;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${tint}`}
        >
          <Icon name={icon} size={19} />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold leading-none text-slate-900 tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 text-sm font-medium text-slate-500">{label}</p>
      {sub && <p className="mt-0.5 text-xs font-medium text-emerald-600">{sub}</p>}
    </div>
  );
}
