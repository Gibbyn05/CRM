"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { CallDirection, CallStatus, DealStage, Reminder } from "@/lib/types";
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
import { DEAL_STAGE_LABELS } from "@/lib/constants";
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

interface ActiveDeal {
  id: string;
  title: string;
  stage: DealStage;
  amount: number | null;
  currency: string;
  updated_at: string;
  customer_id: string | null;
  customers: { name: string } | null;
}

const DEAL_STAGE_STEP: Record<DealStage, number> = {
  ringt: 1,
  tilbud_sendt: 2,
  akseptert: 3,
  tapt: 0,
};

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 10) return "God morgen";
  if (h < 18) return "God dag";
  return "God kveld";
}

// Personlig (selger) eller team-dashbord (leder), i et ryddig kommandosenter-
// oppsett: hilsen + dato, en stripe med nøkkeltall, en to-kolonners kropp med
// samtaleaktivitet + oppgaver, og en tabell over aktive avtaler nederst.
export default function DashboardView({
  isManager,
  userId,
  agentNames,
  firstName,
}: {
  isManager: boolean;
  userId: string;
  agentNames: Record<string, string>;
  firstName: string;
}) {
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>("dag");
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [buckets, setBuckets] = useState<CallBucket[]>([]);
  const [recent, setRecent] = useState<RecentCall[]>([]);
  const [deals, setDeals] = useState<ActiveDeal[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();

  const periodRef = useRef(period);
  useEffect(() => {
    periodRef.current = period;
  }, [period]);

  const reload = useCallback(async () => {
    const p = periodRef.current;
    const [start, end] = periodRange(p);
    const trunc = PERIOD_TRUNC[p];
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
        .limit(8),
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

  useEffect(() => {
    setLoading(true);
    reload();
  }, [period, reload]);

  // Aktive avtaler + egne oppgaver hentes én gang (uavhengig av periode).
  useEffect(() => {
    supabase
      .from("deals")
      .select("id, title, stage, amount, currency, updated_at, customer_id, customers(name)")
      .neq("stage", "tapt")
      .order("updated_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setDeals((data as unknown as ActiveDeal[]) ?? []));

    supabase
      .from("reminders")
      .select("*")
      .eq("agent_id", userId)
      .eq("done", false)
      .order("due_at", { ascending: true })
      .limit(20)
      .then(({ data }) => setReminders((data as Reminder[]) ?? []));
  }, [supabase, userId]);

  // Realtime for samtaler.
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

  async function addTask(title: string) {
    const t = title.trim();
    if (!t) return;
    const due = new Date();
    due.setHours(23, 59, 0, 0);
    const { data } = await supabase
      .from("reminders")
      .insert({
        agent_id: userId,
        created_by: userId,
        title: t,
        due_at: due.toISOString(),
      })
      .select("*")
      .single();
    if (data) setReminders((r) => [...r, data as Reminder]);
  }

  async function completeTask(id: string) {
    setReminders((r) => r.filter((x) => x.id !== id)); // optimistisk
    await supabase
      .from("reminders")
      .update({ done: true, done_at: new Date().toISOString() })
      .eq("id", id);
  }

  const maxCalls = Math.max(1, ...buckets.map((b) => b.calls));
  const pipelineValue = deals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const dateLine = now
    .toLocaleDateString("nb-NO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Hilsen + dato + periodevelger */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-eyebrow">{dateLine}</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            {greeting(now)}, {firstName || "der"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isManager
              ? "Her er et øyeblikksbilde av hele teamet."
              : "Her er et øyeblikksbilde av dagen din."}
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

      {/* Nøkkeltall-stripe */}
      <div
        className={`card grid grid-cols-2 divide-slate-100 transition-opacity duration-300 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x ${
          loading ? "opacity-60" : "opacity-100"
        }`}
      >
        <Stat label="Ringt" value={String(stats?.calls_count ?? 0)} icon="phone" />
        <Stat
          label="Bekreftede møter"
          value={String(stats?.meetings_confirmed ?? 0)}
          icon="calendar"
        />
        <Stat
          label="Salg"
          value={String(stats?.sales_count ?? 0)}
          icon="check"
          sub={
            stats && stats.sales_amount > 0
              ? formatCurrency(stats.sales_amount)
              : undefined
          }
          accent
        />
        <Stat
          label="Avslag"
          value={String(stats?.rejections_count ?? 0)}
          icon="phone-off"
        />
        <Stat
          label="Pipelineverdi"
          value={pipelineValue > 0 ? formatCurrency(pipelineValue) : "–"}
          icon="pipeline"
          sub={`${deals.length} aktive avtaler`}
        />
      </div>

      {/* Kropp: venstre (aktivitet) + høyre (oppgaver) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Samtaler-graf */}
          <div
            className={`card p-5 transition-opacity duration-300 ${
              loading ? "opacity-60" : "opacity-100"
            }`}
          >
            <div className="mb-1 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Samtaler</h2>
                <p className="text-sm text-slate-500">
                  {isManager ? "Hele teamet" : "Dine samtaler"} ·{" "}
                  {PERIOD_LABELS[period]}
                </p>
              </div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {stats?.calls_count ?? 0}
              </p>
            </div>
            <div className="mt-4 overflow-x-auto thin-scroll">
              <div className="flex h-40 items-end gap-1.5">
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
                      <div className="flex h-32 w-full items-end justify-center rounded-md bg-slate-50">
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

          {/* Sist ringt */}
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
            <ul className="divide-y divide-slate-50">
              {recent.map((c) => (
                <li
                  key={c.id}
                  className="animate-row-flash flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <Icon name="phone" size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {c.customer_id && c.customers?.name ? (
                      <Link
                        href={`/customers/${c.customer_id}`}
                        className="truncate font-medium text-slate-800 hover:text-brand-700 hover:underline"
                      >
                        {c.customers.name}
                      </Link>
                    ) : (
                      <span className="truncate font-medium text-slate-700 tabular-nums">
                        {c.phone_number ?? "Ukjent"}
                      </span>
                    )}
                    <p className="truncate text-xs text-slate-400">
                      {CALL_DIRECTION_LABELS[c.direction]}
                      {isManager && c.agent_id && agentNames[c.agent_id]
                        ? ` · ${agentNames[c.agent_id]}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${CALL_STATUS_STYLES[c.status]}`}
                  >
                    {CALL_STATUS_LABELS[c.status]}
                  </span>
                  <span className="hidden shrink-0 text-right text-xs text-slate-400 sm:block">
                    {c.started_at ? timeAgo(c.started_at) : "–"}
                  </span>
                </li>
              ))}
              {!loading && recent.length === 0 && (
                <li className="px-5 py-10 text-center text-sm text-slate-500">
                  Ingen samtaler ennå. Så snart telefonen ringer, dukker de opp her.
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Oppgaver */}
        <TasksCard
          reminders={reminders}
          now={now}
          onAdd={addTask}
          onComplete={completeTask}
        />
      </div>

      {/* Aktive avtaler */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Aktive avtaler</h2>
            <p className="text-sm text-slate-500">
              {deals.length} avtaler i pipeline
            </p>
          </div>
          <Link
            href="/pipeline"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            Åpne pipeline →
          </Link>
        </div>
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="label-eyebrow border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="px-5 py-3">Kunde</th>
                <th className="px-5 py-3">Avtale</th>
                <th className="px-5 py-3">Steg</th>
                <th className="px-5 py-3 text-right">Verdi</th>
                <th className="px-5 py-3 text-right">Oppdatert</th>
              </tr>
            </thead>
            <tbody>
              {deals.slice(0, 6).map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-slate-50 hover:bg-slate-50"
                >
                  <td className="px-5 py-3">
                    {d.customer_id ? (
                      <Link
                        href={`/customers/${d.customer_id}`}
                        className="font-medium text-slate-800 hover:text-brand-700 hover:underline"
                      >
                        {d.customers?.name ?? "Kunde"}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-700">
                        {d.customers?.name ?? "Kunde"}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{d.title}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{
                            width: `${(DEAL_STAGE_STEP[d.stage] / 3) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-500">
                        {DEAL_STAGE_LABELS[d.stage]}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-slate-700 tabular-nums">
                    {d.amount ? formatCurrency(d.amount) : "–"}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400">
                    {timeAgo(d.updated_at)}
                  </td>
                </tr>
              ))}
              {deals.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    Ingen aktive avtaler ennå.
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

// ───────────────────────── Nøkkeltall-flis ─────────────────────────
function Stat({
  label,
  value,
  icon,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  icon: IconName;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            accent ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
          }`}
        >
          <Icon name={icon} size={15} />
        </span>
        <span className="label-eyebrow">{label}</span>
      </div>
      <p
        className={`mt-2 text-2xl font-bold leading-none tabular-nums ${
          accent ? "text-emerald-600" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs font-medium text-slate-400">{sub}</p>}
    </div>
  );
}

// ───────────────────────── Oppgaver-kort ─────────────────────────
function TasksCard({
  reminders,
  now,
  onAdd,
  onComplete,
}: {
  reminders: Reminder[];
  now: Date;
  onAdd: (title: string) => void;
  onComplete: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const groups: { key: string; label: string; items: Reminder[] }[] = [
    { key: "overdue", label: "Forfalt", items: [] },
    { key: "today", label: "I dag", items: [] },
    { key: "upcoming", label: "Senere", items: [] },
  ];
  for (const r of reminders) {
    const due = new Date(r.due_at);
    if (due < startOfToday) groups[0].items.push(r);
    else if (due <= endOfToday) groups[1].items.push(r);
    else groups[2].items.push(r);
  }

  return (
    <div className="card flex h-fit flex-col p-5 lg:sticky lg:top-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Oppgaver</h2>
        <Link
          href="/reminders"
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          Alle →
        </Link>
      </div>

      {/* Legg til */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onAdd(draft);
              setDraft("");
            }
          }}
          placeholder="Legg til en oppgave, trykk Enter"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          onClick={() => {
            onAdd(draft);
            setDraft("");
          }}
          aria-label="Legg til oppgave"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {reminders.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">
            Ingen åpne oppgaver. 🎉
          </p>
        )}
        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.key}>
                <p
                  className={`label-eyebrow mb-1.5 ${
                    g.key === "overdue" ? "text-red-400" : ""
                  }`}
                >
                  {g.label}
                </p>
                <ul className="space-y-1">
                  {g.items.map((r) => (
                    <li key={r.id} className="flex items-start gap-2.5 py-1">
                      <button
                        onClick={() => onComplete(r.id)}
                        aria-label="Fullfør"
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-slate-300 text-transparent transition hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"
                      >
                        <Icon name="check" size={11} />
                      </button>
                      <span className="min-w-0 flex-1 text-sm text-slate-700">
                        {r.title}
                        {r.note && (
                          <span className="block truncate text-xs text-slate-400">
                            {r.note}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
      </div>
    </div>
  );
}
