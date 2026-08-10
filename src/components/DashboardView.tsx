"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Reminder } from "@/lib/types";
import { PERIODS, PERIOD_LABELS, periodRange, type Period } from "@/lib/periods";
import {
  PERIOD_TRUNC,
  bucketLabel,
  type AgentStats,
  type CallBucket,
} from "@/lib/dashboard";
import { formatCurrency, timeAgo } from "@/lib/format";
import Icon, { type IconName } from "./Icon";
import Avatar from "./Avatar";
import DashboardWidgetSettings from "./DashboardWidgetSettings";
import {
  DASHBOARD_WIDGET_COLORS,
  normalizeDashboardWidgets,
  type DashboardWidgetId,
  type DashboardWidgetPreference,
} from "@/lib/dashboard-widgets";

type ActivityType = "call" | "email" | "meeting" | "note" | "task" | "status" | "offer" | "signature" | "payment";

interface RecentActivity {
  activity_id: string;
  activity_type: ActivityType;
  customer_id: string;
  customer_name: string;
  agent_id: string | null;
  agent_name: string;
  title: string;
  summary: string;
  occurred_at: string;
  details: Record<string, string>;
}

type AgreementStatus = "tilbud_sendt" | "signert" | "betalt";

interface ActiveAgreement {
  deal_id: string;
  agent_id: string | null;
  agent_name: string;
  customer_id: string;
  customer_name: string;
  title: string;
  amount: number | null;
  currency: string;
  agreement_status: AgreementStatus;
  due_at: string | null;
  is_overdue: boolean;
  updated_at: string;
}

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 10) return "God morgen";
  if (h < 18) return "God dag";
  return "God kveld";
}

function startOfBucket(date: Date, trunc: string): string {
  const d = new Date(date);
  if (trunc === "hour") {
    d.setMinutes(0, 0, 0);
  } else if (trunc === "day") {
    d.setHours(0, 0, 0, 0);
  } else if (trunc === "week") {
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
  } else {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

function nextBucket(date: Date, trunc: string): Date {
  const d = new Date(date);
  if (trunc === "hour") d.setHours(d.getHours() + 1);
  else if (trunc === "day") d.setDate(d.getDate() + 1);
  else if (trunc === "week") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function emptyBuckets(start: Date, end: Date, trunc: string): CallBucket[] {
  const buckets: CallBucket[] = [];
  let cursor = new Date(startOfBucket(start, trunc));
  while (cursor < end) {
    buckets.push({ bucket: cursor.toISOString(), calls: 0 });
    cursor = nextBucket(cursor, trunc);
  }
  return buckets;
}

function bucketCalls(
  rows: Array<{ started_at: string | null }>,
  start: Date,
  end: Date,
  trunc: string,
): CallBucket[] {
  const buckets = emptyBuckets(start, end, trunc);
  const byKey = new Map(buckets.map((bucket) => [bucket.bucket, bucket]));
  for (const row of rows) {
    if (!row.started_at) continue;
    const key = startOfBucket(new Date(row.started_at), trunc);
    const bucket = byKey.get(key);
    if (bucket) bucket.calls += 1;
  }
  return buckets;
}

// Personlig (selger) eller team-dashbord (leder), i et ryddig kommandosenter-
// oppsett: hilsen + dato, en stripe med nøkkeltall, en to-kolonners kropp med
// samtaleaktivitet + oppgaver, og en tabell over aktive avtaler nederst.
export default function DashboardView({
  isManager,
  userId,
  firstName,
  initialWidgets,
}: {
  isManager: boolean;
  userId: string;
  firstName: string;
  initialWidgets: DashboardWidgetPreference[];
}) {
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>("dag");
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [buckets, setBuckets] = useState<CallBucket[]>([]);
  const [recent, setRecent] = useState<RecentActivity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<RecentActivity | null>(null);
  const [agreements, setAgreements] = useState<ActiveAgreement[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [meetingsToday, setMeetingsToday] = useState(0);
  const [unfollowedMeetings, setUnfollowedMeetings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState(() => normalizeDashboardWidgets(initialWidgets));
  const [editingWidgets, setEditingWidgets] = useState(false);
  const [savingWidgets, setSavingWidgets] = useState(false);
  const [widgetsSaved, setWidgetsSaved] = useState(false);
  const [widgetSaveError, setWidgetSaveError] = useState("");
  const widgetSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      supabase.rpc("get_recent_customer_activities", { p_limit: 12 }),
    ]);

    let nextStats = (statsRes.data as AgentStats[] | null)?.[0] ?? null;
    let nextBuckets = (bucketRes.data as CallBucket[] | null) ?? null;

    if (statsRes.error || bucketRes.error) {
      const [callsRes, meetingsRes, salesRes, rejectionsRes] = await Promise.all([
        supabase
          .from("call_logs")
          .select("started_at", { count: "exact" })
          .gte("started_at", start.toISOString())
          .lt("started_at", end.toISOString()),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("status", "bekreftet")
          .gte("starts_at", start.toISOString())
          .lt("starts_at", end.toISOString()),
        supabase
          .from("deals")
          .select("amount", { count: "exact" })
          .eq("stage", "akseptert")
          .gte("offer_accepted_at", start.toISOString())
          .lt("offer_accepted_at", end.toISOString()),
        supabase
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("stage", "tapt")
          .gte("updated_at", start.toISOString())
          .lt("updated_at", end.toISOString()),
      ]);

      const salesRows = (salesRes.data ?? []) as { amount: number | null }[];
      nextStats = {
        calls_count: callsRes.count ?? 0,
        meetings_confirmed: meetingsRes.count ?? 0,
        sales_count: salesRes.count ?? 0,
        rejections_count: rejectionsRes.count ?? 0,
        sales_amount: salesRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
      };

      nextBuckets = bucketCalls(
        ((callsRes.data ?? []) as { started_at: string | null }[]),
        start,
        end,
        trunc,
      );
    }

    const s = nextStats ?? {
      calls_count: 0,
      meetings_confirmed: 0,
      sales_count: 0,
      rejections_count: 0,
      sales_amount: 0,
    };
    setStats(s);
    setBuckets(nextBuckets ?? []);
    setRecent((recentRes.data as RecentActivity[] | null) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [period, reload]);

  // Aktive avtaler + egne oppgaver hentes én gang (uavhengig av periode).
  useEffect(() => {
    supabase
      .rpc("get_active_agreements")
      .then(({ data }) => setAgreements((data as ActiveAgreement[] | null) ?? []));

    supabase
      .from("reminders")
      .select("*")
      .eq("agent_id", userId)
      .eq("done", false)
      .order("due_at", { ascending: true })
      .limit(50)
      .then(({ data }) => setReminders((data as Reminder[]) ?? []));

    // Møter i dag (RLS avgjør om selger ser egne / leder ser alle).
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    const t1 = new Date();
    t1.setHours(23, 59, 59, 999);
    Promise.all([
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .gte("starts_at", t0.toISOString())
        .lte("starts_at", t1.toISOString())
        .neq("status", "avlyst"),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .lt("starts_at", new Date().toISOString())
        .in("status", ["planlagt", "bekreftet"]),
    ]).then(([todayResult, unfollowedResult]) => {
      setMeetingsToday(todayResult.count ?? 0);
      setUnfollowedMeetings(unfollowedResult.count ?? 0);
    });
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

  function updateWidgets(next: DashboardWidgetPreference[]) {
    const normalized = normalizeDashboardWidgets(next);
    setWidgets(normalized);
    setWidgetsSaved(false);
    setWidgetSaveError("");
    if (widgetSaveTimer.current) clearTimeout(widgetSaveTimer.current);
    widgetSaveTimer.current = setTimeout(async () => {
      setSavingWidgets(true);
      const { error } = await supabase.from("dashboard_preferences").upsert({
        user_id: userId,
        widgets: normalized,
      });
      setSavingWidgets(false);
      if (error) {
        setWidgetSaveError("Kunne ikke lagre oppsettet.");
        return;
      }
      setWidgetsSaved(true);
      setTimeout(() => setWidgetsSaved(false), 1800);
    }, 450);
  }

  useEffect(() => {
    return () => {
      if (widgetSaveTimer.current) clearTimeout(widgetSaveTimer.current);
    };
  }, []);

  const widgetById = Object.fromEntries(widgets.map((widget) => [widget.id, widget])) as Record<
    DashboardWidgetId,
    DashboardWidgetPreference
  >;
  const widgetOrder = Object.fromEntries(widgets.map((widget, index) => [widget.id, index + 10])) as Record<
    DashboardWidgetId,
    number
  >;

  const visibleBuckets =
    period === "dag"
      ? buckets.filter((bucket) => {
          const hour = new Date(bucket.bucket).getHours();
          return hour >= 8 && hour < 20;
        })
      : buckets;
  const maxCalls = Math.max(1, ...visibleBuckets.map((bucket) => bucket.calls));
  const pipelineValue = agreements.reduce((sum, agreement) => sum + Number(agreement.amount ?? 0), 0);
  const overdueAgreements = agreements.filter((agreement) => agreement.is_overdue);

  // «Krever oppmerksomhet»-tall (svarer på «hva bør jeg gjøre nå?»).
  const sot = new Date(now);
  sot.setHours(0, 0, 0, 0);
  const eot = new Date(now);
  eot.setHours(23, 59, 59, 999);
  const overdueCount = reminders.filter((r) => new Date(r.due_at) < sot).length;
  const followUpTodayCount = reminders.filter((r) => {
    const d = new Date(r.due_at);
    return d >= sot && d <= eot;
  }).length;
  const dateLine = now
    .toLocaleDateString("nb-NO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      {/* Hilsen + dato + periodevelger */}
      <div className="rounded-[1.75rem] border border-[#d8c9b0] bg-[#fffaf0]/78 p-6 shadow-[0_24px_70px_rgba(61,44,24,0.08)] backdrop-blur">
        <div>
          <p className="label-eyebrow">{dateLine}</p>
          <h1 className="font-display mt-2 text-[clamp(2.6rem,5vw,4.8rem)] font-bold leading-[0.9] tracking-[-0.04em] text-[#2b2118]">
            {greeting(now)}, {firstName || "der"}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[#6b6660]">
            {isManager
              ? "Her er et øyeblikksbilde av hele teamet."
              : "Her er et øyeblikksbilde av dagen din."}
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#d8c9b0] pt-5">
          <p className="text-sm font-medium text-[#6b6660]">
            {isManager ? "Teamkommando" : "Personlig kommandosenter"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditingWidgets((value) => !value)}
            className={`rounded-full border px-4 py-2 text-sm font-bold transition ${editingWidgets ? "border-[#2b2118] bg-[#2b2118] text-white" : "border-[#d8c9b0] bg-[#fffaf0] text-[#2b2118] hover:bg-[#efe3ce]"}`}
          >
            {editingWidgets ? "Lukk oppsett" : "Tilpass widgets"}
          </button>
          <div className="flex flex-wrap gap-1.5 rounded-full border border-[#d8c9b0] bg-[#efe3ce]/70 p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition active:scale-[0.98] ${
                  period === p
                    ? "bg-[#09fe94] text-[#171717] shadow-[0_8px_24px_rgba(9,254,148,0.18)]"
                    : "text-[#6b6660] hover:bg-[#fffaf0] hover:text-[#2b2118]"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          </div>
        </div>
      </div>

      {editingWidgets && (
        <DashboardWidgetSettings
          widgets={widgets}
          saving={savingWidgets}
          saved={widgetsSaved}
          error={widgetSaveError}
          onChange={updateWidgets}
          onClose={() => setEditingWidgets(false)}
        />
      )}

      {/* Krever oppmerksomhet – handlingsorientert stripe øverst */}
      <DashboardWidgetFrame preference={widgetById.attention} order={widgetOrder.attention}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ActionTile
          href="/reminders"
          label="Forfalt"
          count={overdueCount}
          hint="oppgaver over frist"
          tone="danger"
        />
        <ActionTile
          href="/reminders"
          label="Frist i dag"
          count={followUpTodayCount}
          hint="oppgaver med frist i dag"
          tone="warn"
        />
        <ActionTile
          href="/calendar"
          label="Møter som ikke er fulgt opp"
          count={unfollowedMeetings}
          hint="møter som har passert uten ny status"
          tone="info"
        />
        <ActionTile
          href="/calendar"
          label="Møter i dag"
          count={meetingsToday}
          hint="i kalenderen"
          tone="good"
        />
      </div>
      </DashboardWidgetFrame>

      {/* Nøkkeltall-stripe */}
      <DashboardWidgetFrame preference={widgetById.stats} order={widgetOrder.stats}>
      <div
        className={`card grid grid-cols-2 divide-[#d8c9b0] overflow-hidden transition-opacity duration-300 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x ${
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
          sub={`${agreements.length} aktive avtaler`}
        />
      </div>
      </DashboardWidgetFrame>

      {/* Samtaler-graf */}
      <DashboardWidgetFrame preference={widgetById.calls} order={widgetOrder.calls}>
          <div
            className={`card p-6 transition-opacity duration-300 ${
              loading ? "opacity-60" : "opacity-100"
            }`}
          >
            <div className="mb-1 flex items-center justify-between">
              <div>
                <h2 className="font-display text-3xl font-bold leading-none text-[#2b2118]">Samtaler</h2>
                <p className="mt-1 text-sm text-[#6b6660]">
                  {isManager ? "Hele teamet" : "Dine samtaler"} ·{" "}
                  {PERIOD_LABELS[period]}
                </p>
              </div>
              <p className="font-display text-5xl font-bold leading-none text-[#2b2118] tabular-nums">
                {stats?.calls_count ?? 0}
              </p>
            </div>
            <div className="mt-4 overflow-x-auto thin-scroll">
              <div className="flex h-40 items-end gap-1.5">
                {visibleBuckets.length === 0 && (
                  <p className="m-auto text-sm text-[#8d806e]">
                    Ingen samtaledata for perioden.
                  </p>
                )}
                {visibleBuckets.map((b) => {
                  const h = Math.round((b.calls / maxCalls) * 100);
                  return (
                    <div
                      key={b.bucket}
                      className="group flex min-w-[18px] flex-1 flex-col items-center gap-1.5"
                      title={`${b.calls} samtaler`}
                    >
                      <div className="flex h-32 w-full items-end justify-center rounded-xl bg-[#fbf7ed] ring-1 ring-[#d8c9b0]/70">
                        <div
                          className="w-full max-w-[26px] rounded-xl bg-gradient-to-t from-[#6f4d2e] to-[#09fe94] transition-all group-hover:from-[#2b2118] group-hover:to-[#00e882]"
                          style={{ height: `${Math.max(b.calls > 0 ? 6 : 0, h)}%` }}
                        />
                      </div>
                      <span className="w-full truncate text-center text-3xs font-semibold capitalize text-[#8d806e]">
                        {bucketLabel(b.bucket, period)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
      </DashboardWidgetFrame>

      {/* Siste aktivitet */}
      <DashboardWidgetFrame preference={widgetById.recent} order={widgetOrder.recent}>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#d8c9b0] px-5 py-4">
              <div>
                <h2 className="font-display text-3xl font-bold leading-none text-[#2b2118]">Siste aktivitet</h2>
                <p className="mt-1 text-sm text-[#6b6660]">
                  Siste bevegelse på {isManager ? "teamets kunder" : "dine kunder og salg"}
                </p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full border border-[#d8c9b0] bg-[#eafff5] px-3 py-1 text-xs font-bold text-[#008f52]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#09fe94]" />
                Oppdatert
              </span>
            </div>
            <ul className="divide-y divide-[#d8c9b0]/70">
              {recent.map((activity) => (
                <li
                  key={activity.activity_id}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedActivity(activity)}
                    className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[#fbf7ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#09c977]"
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${activityStyle(activity.activity_type).icon}`}>
                      <Icon name={activityStyle(activity.activity_type).iconName} size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/customers/${activity.customer_id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="truncate font-semibold text-[#2b2118] hover:text-[#008f52] hover:underline"
                      >
                        {activity.customer_name}
                      </Link>
                      <p className="truncate text-xs text-[#8d806e]">
                        {activity.summary}{isManager ? ` · ${activity.agent_name}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.09em] ${activityStyle(activity.activity_type).badge}`}>
                      {activity.title}
                    </span>
                    <span className="hidden min-w-20 shrink-0 text-right text-xs text-[#8d806e] sm:block">
                      {timeAgo(activity.occurred_at)}
                    </span>
                    <Icon name="chevron-right" size={15} className="shrink-0 text-[#b4a48e] transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
              {!loading && recent.length === 0 && (
                <li className="px-5 py-10 text-center text-sm text-[#6b6660]">
                  Ingen kundeaktivitet ennå.
                </li>
              )}
            </ul>
          </div>
      </DashboardWidgetFrame>

      {selectedActivity && (
        <ActivityDetailModal
          activity={selectedActivity}
          isManager={isManager}
          onClose={() => setSelectedActivity(null)}
        />
      )}

      {/* Oppgaver */}
      <DashboardWidgetFrame preference={widgetById.tasks} order={widgetOrder.tasks}>
        <TasksCard
          reminders={reminders}
          now={now}
          onAdd={addTask}
          onComplete={completeTask}
        />
      </DashboardWidgetFrame>

      {/* Aktive avtaler */}
      <DashboardWidgetFrame preference={widgetById.deals} order={widgetOrder.deals}>
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#d8c9b0] px-5 py-4">
          <div>
            <h2 className="font-display text-3xl font-bold leading-none text-[#2b2118]">Aktive avtaler</h2>
            <p className="mt-1 text-sm text-[#6b6660]">
              {agreements.length} avtaler med tilbud sendt
            </p>
          </div>
          <Link
            href={isManager && overdueAgreements.length > 0 ? "/regnskap" : "/pipeline"}
            className="text-sm font-bold text-[#008f52] hover:underline"
          >
            {isManager && overdueAgreements.length > 0 ? "Se forfalte →" : "Åpne pipeline →"}
          </Link>
        </div>
        {isManager && overdueAgreements.length > 0 && (
          <div className="flex items-center justify-between gap-4 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
            <span><strong>{overdueAgreements.length} forfalt</strong> på tvers av selgerteamet</span>
            <span className="text-xs font-bold uppercase tracking-[0.12em]">Krever oppfølging</span>
          </div>
        )}
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="label-eyebrow border-b border-[#d8c9b0] bg-[#fbf7ed]">
              <tr>
                <th className="px-5 py-3">Kunde</th>
                {isManager && <th className="px-5 py-3">Selger</th>}
                <th className="px-5 py-3">Avtale</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Verdi</th>
                <th className="px-5 py-3 text-right">Frist</th>
              </tr>
            </thead>
            <tbody>
              {agreements.slice(0, 8).map((agreement) => (
                <tr
                  key={agreement.deal_id}
                  className={`border-b border-[#d8c9b0]/60 hover:bg-[#fbf7ed] ${agreement.is_overdue ? "bg-red-50/55" : ""}`}
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/customers/${agreement.customer_id}`}
                      className="font-semibold text-[#2b2118] hover:text-[#008f52] hover:underline"
                    >
                      {agreement.customer_name}
                    </Link>
                  </td>
                  {isManager && <td className="px-5 py-3 text-[#6b6660]">{agreement.agent_name}</td>}
                  <td className="px-5 py-3 text-[#6b6660]">{agreement.title}</td>
                  <td className="px-5 py-3">
                    <AgreementProgress status={agreement.agreement_status} overdue={agreement.is_overdue} />
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-[#2b2118] tabular-nums">
                    {agreement.amount ? formatCurrency(Number(agreement.amount)) : "–"}
                  </td>
                  <td className={`px-5 py-3 text-right ${agreement.is_overdue ? "font-bold text-red-700" : "text-[#8d806e]"}`}>
                    {agreement.due_at ? new Date(agreement.due_at).toLocaleDateString("nb-NO") : "–"}
                  </td>
                </tr>
              ))}
              {agreements.length === 0 && (
                <tr>
                  <td colSpan={isManager ? 6 : 5} className="px-5 py-10 text-center text-[#6b6660]">
                    Ingen aktive avtaler ennå.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </DashboardWidgetFrame>
    </div>
  );
}

const ACTIVITY_STYLES: Record<
  ActivityType,
  { iconName: IconName; icon: string; badge: string }
> = {
  call: { iconName: "phone", icon: "bg-[#e8f7ef] text-[#087a4b]", badge: "bg-[#e8f7ef] text-[#087a4b]" },
  email: { iconName: "mail", icon: "bg-[#e9f2fb] text-[#296a9b]", badge: "bg-[#e9f2fb] text-[#296a9b]" },
  meeting: { iconName: "calendar", icon: "bg-[#f1ebfa] text-[#765098]", badge: "bg-[#f1ebfa] text-[#765098]" },
  note: { iconName: "receipt", icon: "bg-[#fff1db] text-[#9b641b]", badge: "bg-[#fff1db] text-[#9b641b]" },
  task: { iconName: "check", icon: "bg-[#e8f7ef] text-[#087a4b]", badge: "bg-[#e8f7ef] text-[#087a4b]" },
  status: { iconName: "route", icon: "bg-[#f3eee5] text-[#725b3f]", badge: "bg-[#f3eee5] text-[#725b3f]" },
  offer: { iconName: "pipeline", icon: "bg-[#fff0e9] text-[#aa4c2e]", badge: "bg-[#fff0e9] text-[#aa4c2e]" },
  signature: { iconName: "receipt", icon: "bg-[#e8f7ef] text-[#087a4b]", badge: "bg-[#e8f7ef] text-[#087a4b]" },
  payment: { iconName: "wallet", icon: "bg-[#e7f6f4] text-[#167c73]", badge: "bg-[#e7f6f4] text-[#167c73]" },
};

function activityStyle(type: ActivityType) {
  return ACTIVITY_STYLES[type] ?? ACTIVITY_STYLES.status;
}

function ActivityDetailModal({
  activity,
  isManager,
  onClose,
}: {
  activity: RecentActivity;
  isManager: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const style = activityStyle(activity.activity_type);
  const occurredAt = new Date(activity.occurred_at);

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-[90] flex items-center justify-center bg-[#17120d]/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-modal-title"
      onClick={onClose}
    >
      <div
        className="animate-panel-in w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-[#d8c9b0] bg-[#fffaf0] shadow-[0_28px_90px_rgba(38,28,18,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative border-b border-[#d8c9b0] px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-[#d8c9b0] text-[#6b6660] transition hover:bg-white hover:text-[#2b2118]"
          >
            <Icon name="close" size={16} />
          </button>
          <div className="flex items-center gap-3 pr-12">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${style.icon}`}>
              <Icon name={style.iconName} size={20} />
            </span>
            <div>
              <p className="label-eyebrow">{activity.title}</p>
              <h2 id="activity-modal-title" className="mt-1 font-display text-3xl font-bold leading-none text-[#2b2118]">
                {activity.customer_name}
              </h2>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <p className="text-base font-semibold leading-relaxed text-[#3d342b]">{activity.summary}</p>

          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-2xl border border-[#e5d8c1] bg-white/60 p-4">
            <div>
              <dt className="label-eyebrow">Tidspunkt</dt>
              <dd className="mt-1 text-sm font-semibold text-[#2b2118]">
                {occurredAt.toLocaleDateString("nb-NO")} kl. {occurredAt.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
              </dd>
            </div>
            {(isManager || activity.agent_name !== "Ukjent") && (
              <div>
                <dt className="label-eyebrow">Selger</dt>
                <dd className="mt-1 text-sm font-semibold text-[#2b2118]">{activity.agent_name}</dd>
              </div>
            )}
            {Object.entries(activity.details ?? {}).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="label-eyebrow">{label}</dt>
                <dd className="mt-1 break-words text-sm font-semibold capitalize text-[#2b2118]">{value || "–"}</dd>
              </div>
            ))}
          </dl>

          <Link
            href={`/customers/${activity.customer_id}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#171717] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#008f52]"
          >
            Åpne kundekort
            <Icon name="chevron-right" size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}

const AGREEMENT_STEPS: Array<{ id: AgreementStatus; label: string }> = [
  { id: "tilbud_sendt", label: "Tilbud sendt" },
  { id: "signert", label: "Signert" },
  { id: "betalt", label: "Betalt" },
];

function AgreementProgress({ status, overdue }: { status: AgreementStatus; overdue: boolean }) {
  const activeIndex = AGREEMENT_STEPS.findIndex((step) => step.id === status);
  return (
    <div className="min-w-56">
      <div className="flex items-center">
        {AGREEMENT_STEPS.map((step, index) => {
          const complete = index <= activeIndex;
          return (
            <div key={step.id} className="flex flex-1 items-center last:flex-none">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-offset-2 ${
                  complete ? "bg-[#09c977] ring-[#09c977]/35" : "bg-[#d8c9b0] ring-transparent"
                }`}
              />
              {index < AGREEMENT_STEPS.length - 1 && (
                <span className={`mx-1 h-px flex-1 ${index < activeIndex ? "bg-[#09c977]" : "bg-[#d8c9b0]"}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-[#2b2118]">{AGREEMENT_STEPS[activeIndex]?.label}</span>
        {overdue && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-red-700">
            Forfalt
          </span>
        )}
      </div>
    </div>
  );
}

function DashboardWidgetFrame({
  preference,
  order,
  children,
}: {
  preference: DashboardWidgetPreference;
  order: number;
  children: React.ReactNode;
}) {
  if (!preference.visible) return null;
  const color = DASHBOARD_WIDGET_COLORS[preference.color];
  return (
    <section
      className="rounded-[2rem] border p-2 shadow-[0_16px_48px_rgba(61,44,24,0.06)] transition-colors duration-300 [&>.card]:!border-0 [&>.card]:!bg-transparent [&>.card]:!shadow-none"
      style={{ order, backgroundColor: color.background, borderColor: color.border }}
      data-widget={preference.id}
    >
      {children}
    </section>
  );
}

// ─────────────────── Handlingsflis «krever oppmerksomhet» ───────────────────
function ActionTile({
  href,
  label,
  count,
  hint,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  hint: string;
  tone: "danger" | "warn" | "good" | "info" | "calm";
}) {
  const toneStyle =
    tone === "danger"
      ? "border-[#f0b3a1] bg-[#fff0ea]"
      : tone === "warn"
        ? "border-[#e8cf8f] bg-[#fff7e6]"
        : tone === "good"
          ? "border-[#9fe6c4] bg-[#eafff5]"
          : tone === "info"
            ? "border-[#a9c9e8] bg-[#edf6ff]"
          : "border-[#d8c9b0] bg-[#fffaf0]";
  const numStyle =
    tone === "danger"
      ? "text-[#c0392b]"
      : tone === "warn"
        ? "text-[#a9720a]"
        : tone === "good"
          ? "text-[#008f52]"
          : tone === "info"
            ? "text-[#176aa6]"
          : "text-[#8d806e]";
  return (
    <Link
      href={href}
      className={`group rounded-2xl border p-4 shadow-[0_10px_30px_rgba(61,44,24,0.05)] transition hover:shadow-[0_14px_36px_rgba(61,44,24,0.10)] ${toneStyle}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-eyebrow">{label}</span>
        <span
          className={`font-display text-3xl font-bold leading-none tabular-nums ${numStyle}`}
        >
          {count}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-[#8d806e] group-hover:text-[#6b6660]">
        {hint}
      </p>
    </Link>
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
    <div className="px-5 py-5">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            accent ? "bg-[#eafff5] text-[#008f52]" : "bg-[#efe3ce] text-[#6f4d2e]"
          }`}
        >
          <Icon name={icon} size={15} />
        </span>
        <span className="label-eyebrow">{label}</span>
      </div>
      <p
        className={`mt-2 text-2xl font-bold leading-none tabular-nums ${
          accent ? "text-[#008f52]" : "text-[#2b2118]"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs font-medium text-[#8d806e]">{sub}</p>}
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
    <div className="card flex h-fit flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-3xl font-bold leading-none text-[#2b2118]">Oppgaver</h2>
        <Link
          href="/reminders"
          className="text-xs font-bold text-[#008f52] hover:underline"
        >
          Alle →
        </Link>
      </div>

      {/* Legg til */}
      <div className="flex items-center gap-2 rounded-2xl border border-[#d8c9b0] bg-[#fbf7ed] px-3 py-2 transition focus-within:border-[#09fe94]/70 focus-within:ring-2 focus-within:ring-[#09fe94]/15">
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
          className="min-w-0 flex-1 bg-transparent text-sm text-[#2b2118] placeholder:text-[#8d806e] focus:outline-none"
        />
        <button
          onClick={() => {
            onAdd(draft);
            setDraft("");
          }}
          aria-label="Legg til oppgave"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#09fe94] text-[#171717] transition hover:bg-[#00e882] active:scale-[0.96]"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {reminders.length === 0 && (
          <p className="py-6 text-center text-sm text-[#8d806e]">
            Ingen åpne oppgaver. 🎉
          </p>
        )}
        {groups.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.key}>
                <p
                  className={`label-eyebrow mb-1.5 ${
                            g.key === "overdue" ? "text-[#ff470a]" : ""
                  }`}
                >
                  {g.label}
                </p>
                <ul className="space-y-1">
                  {g.items.map((r) => (
                    <li key={r.id} className="flex items-start gap-2.5 rounded-xl py-1 transition hover:bg-[#fbf7ed]">
                      <button
                        onClick={() => onComplete(r.id)}
                        aria-label="Fullfør"
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-[#b7a991] text-transparent transition hover:border-[#09fe94] hover:bg-[#09fe94] hover:text-[#171717]"
                      >
                        <Icon name="check" size={11} />
                      </button>
                      <span className="min-w-0 flex-1 text-sm text-[#3d3a34]">
                        {r.title}
                        {r.note && (
                          <span className="block truncate text-xs text-[#8d806e]">
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
