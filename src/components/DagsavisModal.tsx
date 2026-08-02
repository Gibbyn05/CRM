"use client";

import { useEffect, useMemo, useState } from "react";
import type { Profile } from "@/lib/types";
import { formatDate } from "@/lib/format";
import type {
  DagsavisPeriod,
  DagsavisSection,
  DagsavisSeriesPoint,
  ManagerSellerSummary,
} from "@/lib/dagsavis";
import type { DailyReport, DailyTeamReport } from "@/lib/types";
import DagsavisChart from "./DagsavisChart";
import Icon from "./Icon";
import styles from "./DagsavisModal.module.css";

type DagsavisScope = "agent" | "team";

interface DagsavisResponse {
  scope: DagsavisScope;
  report_date: string;
  report: DailyReport | DailyTeamReport | null;
  cards: DagsavisSection[];
  chart: DagsavisSeriesPoint[];
  team_report: DailyTeamReport | null;
  manager_rows: ManagerSellerSummary[] | null;
  agents: Pick<Profile, "id" | "full_name" | "email">[];
  quote_of_the_day: string;
}

export default function DagsavisModal({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  profile: Profile | null;
}) {
  const isManager = profile?.role === "manager";
  const [scope, setScope] = useState<DagsavisScope>(isManager ? "team" : "agent");
  const [period, setPeriod] = useState<DagsavisPeriod>("dag");
  const [agentId, setAgentId] = useState(
    isManager ? "" : profile?.id ?? "",
  );
  const [data, setData] = useState<DagsavisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    if (!isManager) {
      setScope("agent");
      setAgentId(profile?.id ?? "");
      return;
    }
    setScope("team");
    setAgentId("");
  }, [open, isManager, profile?.id]);

  useEffect(() => {
    if (!open || !isManager || scope !== "agent" || agentId || !data?.agents.length) {
      return;
    }
    setAgentId(data.agents[0]?.id ?? "");
  }, [open, isManager, scope, agentId, data?.agents]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    const activeAgentId = scope === "agent" ? agentId || null : null;

    if (isManager && scope === "agent" && !activeAgentId) {
      return;
    }

    const body = {
      scope,
      agent_id: activeAgentId,
      period,
    };

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/dagsavis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Kunne ikke hente dagsavis");
        }
        const json = (await response.json()) as DagsavisResponse;
        setData(json);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Ukjent feil");
      } finally {
        setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [open, scope, agentId, period, isManager, profile?.id, refreshNonce]);

  const report = data?.report ?? null;
  const teamReport = data?.team_report ?? null;
  const summaryText =
    scope === "team"
      ? teamReport?.summary_text ?? report?.summary_text ?? null
      : report?.summary_text ?? null;

  const reportTitle = useMemo(() => {
    if (!report) return "Dagsavis";
    if (scope === "team") return `Teamavis: ${formatDate(data?.report_date ?? report.report_date)}`;
    const selectedName =
      data?.agents.find((entry) => entry.id === agentId)?.full_name ||
      data?.agents[0]?.full_name ||
      profile?.full_name ||
      "Selger";
    return `${selectedName}: ${formatDate(data?.report_date ?? report.report_date)}`;
  }, [agentId, data, profile?.full_name, report, scope]);

  const editionDate = formatDate(data?.report_date ?? new Date().toISOString());

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      role="presentation"
    >
      <div className={styles.sheet}>
        <div className={styles.sheetInner}>
          <header className={styles.masthead}>
            <div className={styles.editionBar}>
              <span>Salgssentralen</span>
              <span>Utgave {data?.report_date ?? "i dag"}</span>
              <span>{editionDate}</span>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={styles.subtitle}>Daglig salgsrapport</p>
                <h2 className={styles.newspaperName}>Dagsavisen</h2>
                <h3 className={styles.headline}>{reportTitle}</h3>
                <p className={styles.deck}>
                  En kort, lesbar morgenutgave med nøkkeltall, samtaler, salg,
                  omsetning, møter og utvikling. Rapporten hentes fra dagens
                  aktivitets- og salgsdata.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Lukk dagsavis"
                className={styles.closeButton}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className={styles.controls}>
              {isManager && (
                <div className={styles.segmentControl}>
                  <button
                    type="button"
                    onClick={() => setScope("team")}
                    className={scope === "team" ? styles.segmentActive : styles.segmentButton}
                  >
                    Team
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("agent")}
                    className={scope === "agent" ? styles.segmentActive : styles.segmentButton}
                  >
                    Selger
                  </button>
                </div>
              )}

              {isManager && scope === "agent" && (
                <label className="flex min-w-[220px] flex-col gap-1">
                  <span className={styles.controlLabel}>Selger</span>
                  <select
                    value={agentId}
                    onChange={(event) => setAgentId(event.target.value)}
                    className={styles.selectControl}
                  >
                    {data?.agents.length ? (
                      data.agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.full_name || agent.email || "Ukjent"}
                        </option>
                      ))
                    ) : (
                      <option value={profile?.id ?? ""}>
                        {profile?.full_name || profile?.email || "Ukjent"}
                      </option>
                    )}
                  </select>
                </label>
              )}

              <div className={styles.segmentControl}>
                {([
                  ["dag", "Dag"],
                  ["uke", "Uke"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPeriod(value)}
                    className={period === value ? styles.segmentActive : styles.segmentButton}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <div className={styles.content}>
            <section className={`${styles.article} ${styles.leftPage}`}>
              <div className="space-y-4">
                {loading && (
                  <div className={styles.noticeBox}>
                    Leser dagens arkiv og setter opp utgaven …
                  </div>
                )}
                {error && (
                  <div className={styles.noticeBox}>
                    <p className="text-sm text-red-700">{error}</p>
                    <button
                      type="button"
                      onClick={() => setRefreshNonce((current) => current + 1)}
                      className={styles.inkButton}
                    >
                      Prøv igjen
                    </button>
                  </div>
                )}

                {!loading && !error && (
                  <>
                    <article className={`${styles.newspaperCard} ${styles.leadStory}`}>
                      <div className={styles.storyHeader}>
                        <div>
                          <p className={styles.cardTitle}>Utgave {data?.report_date ?? "—"}</p>
                          <h3 className={styles.storyTitle}>
                            Dagens oppsummering
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setLoading(true);
                            setError(null);
                            fetch("/api/dagsavis", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                scope,
                                agent_id: scope === "agent" ? agentId || profile?.id || null : null,
                                period,
                                force: true,
                              }),
                            })
                              .then(async (response) => {
                                if (!response.ok) {
                                  const payload = await response.json().catch(() => ({}));
                                  throw new Error(payload.error || "Kunne ikke regenerere");
                                }
                                return response.json() as Promise<DagsavisResponse>;
                              })
                              .then(setData)
                              .catch((cause: unknown) => {
                                setError(cause instanceof Error ? cause.message : "Ukjent feil");
                              })
                              .finally(() => setLoading(false));
                          }}
                          className={styles.inkButton}
                        >
                          Regenerer
                        </button>
                      </div>
                      <div className={styles.summaryColumns}>
                        <p className={styles.summaryText}>
                          {summaryText || "Ingen oppsummering er tilgjengelig ennå."}
                        </p>
                      </div>
                    </article>

                    <div className={styles.metricsGrid}>
                      {data?.cards.map((card) => (
                        <MetricCard key={card.key} card={card} />
                      ))}
                    </div>

                    <div className={styles.chartPanel}>
                      <DagsavisChart
                        period={period}
                        points={data?.chart ?? []}
                        onPeriodChange={setPeriod}
                      />
                    </div>

                    <section className={styles.heroStory}>
                      <div>
                        <p className={styles.cardTitle}>Kort status</p>
                        <h3>Dagens salgsbilde</h3>
                        <p>
                          Aktivitet, nye muligheter, møter og salg samlet i en
                          rask oversikt.
                        </p>
                      </div>
                      <NewspaperIllustration variant="desk" />
                    </section>
                  </>
                )}
              </div>
            </section>

            <aside className={`${styles.aside} ${styles.rightPage}`}>
              <section className={`${styles.newspaperCard} ${styles.quoteBox}`}>
                <p className={styles.cardTitle}>Quote of the day</p>
                <blockquote>
                  “{data?.quote_of_the_day || "Kunden kjøper ikke press. Kunden kjøper klarhet."}”
                </blockquote>
              </section>

              <section className={`${styles.newspaperCard} ${styles.imageStory}`}>
                <div>
                  <p className={styles.cardTitle}>Dagens bilde</p>
                  <h3 className={styles.sideTitle}>Aktivitet ved pulten</h3>
                </div>
                <NewspaperIllustration variant="phone" />
              </section>

              {isManager && (
                <section className={`${styles.newspaperCard} ${styles.sideStory}`}>
                  <p className={styles.cardTitle}>Lederpanel</p>
                  <h3 className={styles.sideTitle}>Team og utvikling</h3>
                  <div className="mt-4 space-y-4 text-sm text-black/75">
                    <div className={styles.editorBox}>
                      <p className="text-xs uppercase tracking-[0.22em] text-black/50">
                        Teamavis
                      </p>
                      <p className="mt-2 leading-6">
                        {teamReport?.summary_text || "Teamoppsummeringen blir vist her når den er generert."}
                      </p>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className={styles.controlLabel}>Selgeroversikt</p>
                        <span className="text-xs text-black/45">
                          {period === "dag" ? "Valgt dag" : "Valgt uke"}
                        </span>
                      </div>

                      <div className={styles.tableWrap}>
                        <table className={styles.managerTable}>
                          <thead>
                            <tr>
                              <th>Selger</th>
                              <th>Aktivitet</th>
                              <th>Salg</th>
                              <th>Omsetning</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data?.manager_rows?.length ? (
                              data.manager_rows.map((row) => (
                                <tr key={row.agent_id}>
                                  <td>
                                    <div className="font-medium text-black">
                                      {row.full_name}
                                    </div>
                                    <div className="text-xs text-black/45">
                                      {formatDelta(row.delta_calls_count, "samtaler")} ·{" "}
                                      {formatDelta(row.delta_sales_count, "salg")}
                                    </div>
                                  </td>
                                  <td>
                                    {row.calls_count}
                                    <div className="text-xs text-black/45">
                                      {signedNumber(row.delta_calls_count)}
                                    </div>
                                  </td>
                                  <td>
                                    {row.sales_count}
                                    <div className="text-xs text-black/45">
                                      {signedNumber(row.delta_sales_count)}
                                    </div>
                                  </td>
                                  <td>
                                    {formatMoney(row.revenue_amount)}
                                    <div className="text-xs text-black/45">
                                      {signedMoney(row.delta_revenue_amount)}
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4} className="py-8 text-center text-black/45">
                                  Ingen ledersnitt tilgjengelig ennå.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <section className={`${styles.newspaperCard} ${styles.sideStory}`}>
                <p className={styles.cardTitle}>Utgaveinfo</p>
                <div className="mt-3 space-y-2 text-sm text-black/75">
                  <p>Dato: {formatDate(data?.report_date ?? new Date().toISOString())}</p>
                  <p>Visning: {scope === "team" ? "Team" : "Selger"}</p>
                  <p>Periodegraf: {period === "dag" ? "Dag" : "Uke"}</p>
                  <p>Tilgjengelig for ledere: {isManager ? "Ja" : "Nei"}</p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewspaperIllustration({ variant }: { variant: "desk" | "phone" }) {
  return (
    <figure className={`${styles.illustration} ${styles[variant]}`} aria-hidden="true">
      <span className={styles.sun} />
      <span className={styles.frameLine} />
      <span className={styles.personHead} />
      <span className={styles.personBody} />
      <span className={styles.objectOne} />
      <span className={styles.objectTwo} />
    </figure>
  );
}

function MetricCard({ card }: { card: DagsavisSection }) {
  return (
    <div className={`${styles.newspaperCard} ${styles.metricCard}`}>
      <p className={styles.cardTitle}>{card.label}</p>
      <div className="mt-2 flex items-end gap-1">
        <span className={styles.metricValue}>
          {formatMetric(card.value)}
        </span>
        {card.suffix && (
          <span className="pb-1 text-sm text-black/55">{card.suffix}</span>
        )}
      </div>
      {card.hint && <p className="mt-2 text-sm text-black/55">{card.hint}</p>}
    </div>
  );
}

function formatMetric(value: number): string {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 0,
  }).format(value) + " kr";
}

function signedNumber(value: number): string {
  const formatter = new Intl.NumberFormat("nb-NO", {
    signDisplay: "always",
    maximumFractionDigits: 0,
  });
  return formatter.format(value);
}

function signedMoney(value: number): string {
  const formatter = new Intl.NumberFormat("nb-NO", {
    signDisplay: "always",
    maximumFractionDigits: 0,
  });
  return `${formatter.format(value)} kr`;
}

function formatDelta(value: number, label: string) {
  if (value === 0) return `0 ${label}`;
  return `${value > 0 ? "+" : ""}${value} ${label}`;
}
