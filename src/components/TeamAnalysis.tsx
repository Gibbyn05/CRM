"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PERIODS, PERIOD_LABELS, periodRange, type Period } from "@/lib/periods";
import { formatCurrency } from "@/lib/format";
import Avatar from "./Avatar";
import Icon, { type IconName } from "./Icon";

interface TeamAnalysisRow {
  agent_id: string;
  full_name: string;
  avatar_url: string | null;
  calls_count: number;
  meetings_count: number;
  offers_count: number;
  signed_count: number;
  revenue_amount: number;
  conversion_rate: number;
  followups_count: number;
  activity_points: number;
}

type CountMetric = Exclude<
  keyof TeamAnalysisRow,
  "agent_id" | "full_name" | "avatar_url" | "revenue_amount" | "conversion_rate" | "activity_points"
>;

const METRICS: Array<{ key: CountMetric; label: string; icon: IconName; tone: string }> = [
  { key: "calls_count", label: "Samtaler", icon: "phone", tone: "#176aa6" },
  { key: "meetings_count", label: "Møter", icon: "calendar", tone: "#7a4fa3" },
  { key: "offers_count", label: "Tilbud", icon: "receipt", tone: "#a56808" },
  { key: "signed_count", label: "Signert", icon: "check", tone: "#008f52" },
  { key: "followups_count", label: "Oppfølginger", icon: "clock", tone: "#8b5e3c" },
];

export default function TeamAnalysis() {
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>("maned");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [rows, setRows] = useState<TeamAnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const [start, end] = periodRange(period);
    setLoading(true);
    setError("");
    supabase
      .rpc("get_team_analysis", {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      })
      .then(({ data, error: queryError }) => {
        if (!active) return;
        setRows((data as TeamAnalysisRow[] | null) ?? []);
        setError(queryError ? "Kunne ikke hente teamanalysen." : "");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [period, supabase]);

  const maxActivity = Math.max(1, ...rows.map((row) => row.activity_points));
  const scoredRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        activity_score: Math.round((row.activity_points / maxActivity) * 100),
      })),
    [rows, maxActivity],
  );
  const selected = scoredRows.find((row) => row.agent_id === selectedAgent);
  const visibleRows = selected ? [selected] : scoredRows;
  const totals = visibleRows.reduce(
    (sum, row) => ({
      calls_count: sum.calls_count + Number(row.calls_count),
      meetings_count: sum.meetings_count + Number(row.meetings_count),
      offers_count: sum.offers_count + Number(row.offers_count),
      signed_count: sum.signed_count + Number(row.signed_count),
      followups_count: sum.followups_count + Number(row.followups_count),
      revenue_amount: sum.revenue_amount + Number(row.revenue_amount),
    }),
    {
      calls_count: 0,
      meetings_count: 0,
      offers_count: 0,
      signed_count: 0,
      followups_count: 0,
      revenue_amount: 0,
    },
  );
  const conversionRate =
    totals.offers_count > 0 ? (totals.signed_count / totals.offers_count) * 100 : 0;
  const activityScore = selected?.activity_score ?? Math.round(
    scoredRows.reduce((sum, row) => sum + row.activity_score, 0) / Math.max(scoredRows.length, 1),
  );

  return (
    <div className="space-y-6">
      <header className="rounded-[1.75rem] border border-[#d8c9b0] bg-[#fffaf0]/85 p-6 shadow-[0_24px_70px_rgba(61,44,24,0.08)]">
        <p className="label-eyebrow">Lederverktøy</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] font-bold leading-[0.9] tracking-[-0.04em] text-[#2b2118]">
              Teamanalyse
            </h1>
            <p className="mt-3 max-w-2xl text-[#6b6660]">
              Sammenlign aktivitet, salgsarbeid og resultater for hver selger.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="min-w-52">
              <span className="sr-only">Velg selger</span>
              <select
                value={selectedAgent}
                onChange={(event) => setSelectedAgent(event.target.value)}
                className="w-full rounded-full border border-[#d8c9b0] bg-[#fffaf0] px-4 py-2.5 text-sm font-bold text-[#2b2118] outline-none focus:border-[#008f52]"
              >
                <option value="all">Hele teamet</option>
                {scoredRows.map((row) => (
                  <option key={row.agent_id} value={row.agent_id}>{row.full_name}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-1 rounded-full border border-[#d8c9b0] bg-[#efe3ce]/70 p-1">
              {PERIODS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={`rounded-full px-3.5 py-2 text-sm font-bold transition ${
                    period === value ? "bg-[#2b2118] text-white" : "text-[#6b6660] hover:bg-[#fffaf0]"
                  }`}
                >
                  {PERIOD_LABELS[value]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <section className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "opacity-55" : ""}`}>
        <MetricCard label="Omsetning" value={formatCurrency(totals.revenue_amount)} detail="aksepterte avtaler" icon="wallet" accent />
        <MetricCard label="Konvertering" value={`${conversionRate.toFixed(1)} %`} detail="signert av sendte tilbud" icon="pipeline" />
        <MetricCard label="Aktivitetsnivå" value={`${activityScore}/100`} detail={activityLabel(activityScore)} icon="live" />
        <MetricCard label="Signerte avtaler" value={String(totals.signed_count)} detail={`${totals.offers_count} tilbud sendt`} icon="check" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {METRICS.map((metric) => (
          <article key={metric.key} className="rounded-2xl border border-[#d8c9b0] bg-[#fffaf0]/75 p-4">
            <div className="flex items-center gap-2" style={{ color: metric.tone }}>
              <Icon name={metric.icon} size={16} />
              <span className="text-xs font-black uppercase tracking-[0.12em]">{metric.label}</span>
            </div>
            <p className="mt-3 font-display text-4xl font-bold tabular-nums text-[#2b2118]">{totals[metric.key]}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-[#d8c9b0] bg-[#fffaf0]/82 shadow-[0_18px_55px_rgba(61,44,24,0.07)]">
        <div className="border-b border-[#d8c9b0] px-5 py-4">
          <h2 className="font-display text-3xl font-bold text-[#2b2118]">Sammenligning</h2>
          <p className="text-sm text-[#6b6660]">Klikk på en selger for å isolere resultatene.</p>
        </div>
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full min-w-[62rem] text-left text-sm">
            <thead className="label-eyebrow bg-[#efe3ce]/55">
              <tr>
                <th className="px-5 py-3">Selger</th>
                <th className="px-3 py-3 text-right">Samtaler</th>
                <th className="px-3 py-3 text-right">Møter</th>
                <th className="px-3 py-3 text-right">Tilbud</th>
                <th className="px-3 py-3 text-right">Signert</th>
                <th className="px-3 py-3 text-right">Omsetning</th>
                <th className="px-3 py-3 text-right">Konvertering</th>
                <th className="px-5 py-3">Aktivitet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d8c9b0]/65">
              {scoredRows.map((row) => (
                <tr
                  key={row.agent_id}
                  className={`transition hover:bg-[#efe3ce]/45 ${row.agent_id === selectedAgent ? "bg-[#eafff5]/60" : ""}`}
                >
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setSelectedAgent(row.agent_id === selectedAgent ? "all" : row.agent_id)}
                      aria-pressed={row.agent_id === selectedAgent}
                      className="flex items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[#008f52] focus-visible:ring-offset-2"
                    >
                      <Avatar name={row.full_name} url={row.avatar_url} size={34} />
                      <div>
                        <p className="font-bold text-[#2b2118]">{row.full_name}</p>
                        <p className="text-xs text-[#8d806e]">{row.followups_count} oppfølginger</p>
                      </div>
                    </button>
                  </td>
                  <NumberCell value={row.calls_count} />
                  <NumberCell value={row.meetings_count} />
                  <NumberCell value={row.offers_count} />
                  <NumberCell value={row.signed_count} strong />
                  <td className="px-3 py-4 text-right font-bold tabular-nums text-[#008f52]">{formatCurrency(row.revenue_amount)}</td>
                  <td className="px-3 py-4 text-right font-bold tabular-nums">{Number(row.conversion_rate).toFixed(1)} %</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-[#dfd3bf]">
                        <div className="h-full rounded-full bg-[#09c977]" style={{ width: `${row.activity_score}%` }} />
                      </div>
                      <span className="w-8 text-right font-bold tabular-nums text-[#2b2118]">{row.activity_score}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && scoredRows.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-[#8d806e]">Ingen aktive selgere å analysere.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function activityLabel(score: number) {
  if (score >= 75) return "Høyt aktivitetsnivå";
  if (score >= 40) return "Middels aktivitetsnivå";
  if (score > 0) return "Lavt aktivitetsnivå";
  return "Ingen registrert aktivitet";
}

function MetricCard({ label, value, detail, icon, accent = false }: { label: string; value: string; detail: string; icon: IconName; accent?: boolean }) {
  return (
    <article className={`rounded-[1.5rem] border p-5 ${accent ? "border-[#9fe6c4] bg-[#eafff5]" : "border-[#d8c9b0] bg-[#fffaf0]/82"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="label-eyebrow">{label}</p>
        <Icon name={icon} size={18} />
      </div>
      <p className="mt-4 font-display text-4xl font-bold leading-none tabular-nums text-[#2b2118]">{value}</p>
      <p className="mt-2 text-sm text-[#6b6660]">{detail}</p>
    </article>
  );
}

function NumberCell({ value, strong = false }: { value: number; strong?: boolean }) {
  return <td className={`px-3 py-4 text-right tabular-nums ${strong ? "font-bold text-[#008f52]" : "text-[#3d3a34]"}`}>{value}</td>;
}
