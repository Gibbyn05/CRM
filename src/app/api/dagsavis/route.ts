import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  dagsavisEmailHtml,
  dagsavisEmailText,
  sendEmail,
} from "@/lib/email";
import { sendSms, isSmsConfigured, getSmsProvider } from "@/lib/providers/sms";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { DailyReport, DailyTeamReport, Profile } from "@/lib/types";
import {
  buildDagsavisSections,
  computeManagerRows,
  computeMetrics,
  computeRangeMetrics,
  computeSeries,
  dayBounds,
  getTimeInTimeZone,
  getQuoteOfTheDay,
  generateSummary,
  generateTeamSummary,
  todayISO,
  toDailyReportRow,
  toTeamReportRow,
  type DagsavisMetrics,
  type DagsavisPeriod,
  type DagsavisSection,
  type DagsavisSeriesPoint,
  type ManagerSellerSummary,
} from "@/lib/dagsavis";

export const dynamic = "force-dynamic";

type DagsavisScope = "agent" | "team";

type DagsavisSendResult = {
  channel: "email" | "sms";
  to: string;
  provider: string;
  provider_ref: string | null;
  error?: string;
};

interface RequestBody {
  scope?: DagsavisScope;
  agent_id?: string | null;
  date?: string;
  period?: DagsavisPeriod;
  force?: boolean;
}

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

function sellerFallbackSummary(metrics: DagsavisMetrics): string {
  const activity = metrics.calls_count > 0
    ? `Dagen endte med ${metrics.calls_count} samtaler og ${metrics.booked_meetings_count} bookede møter.`
    : "Det er foreløpig ikke registrert samtaleaktivitet for denne dagen.";
  const result = metrics.sales_count > 0
    ? `${metrics.sales_count} salg ga en omsetning på ${formatReportMoney(metrics.revenue_amount)}.`
    : "Ingen salg er registrert ennå, så neste relevante kundeoppfølging bør prioriteres.";
  return `${activity} ${result} Start med de varmeste kundene og avklar neste steg i hver dialog.`;
}

function teamFallbackSummary(metrics: DagsavisMetrics, sellerRows: ManagerSellerSummary[]): string {
  const leader = sellerRows.find((row) => row.sales_count > 0 || row.calls_count > 0);
  const leaderText = leader
    ? ` ${leader.full_name} har høyest synlig aktivitet med ${leader.calls_count} samtaler og ${leader.sales_count} salg.`
    : "";
  return `Teamet har registrert ${metrics.calls_count} samtaler, ${metrics.sales_count} salg og ${formatReportMoney(metrics.revenue_amount)} i omsetning.${leaderText} Følg opp åpne tilbud og avtal ett tydelig neste steg per kunde.`;
}

function makeFallbackSellerReport(
  agentId: string,
  dateISO: string,
  metrics: DagsavisMetrics,
  summaryText: string,
): DailyReport {
  return {
    id: `fallback-${agentId}-${dateISO}`,
    agent_id: agentId,
    report_date: dateISO,
    calls_count: metrics.calls_count,
    meetings_confirmed: metrics.meetings_confirmed,
    sales_count: metrics.sales_count,
    rejections_count: metrics.rejections_count,
    revenue_amount: metrics.revenue_amount,
    new_customers_count: metrics.new_customers_count,
    booked_meetings_count: metrics.booked_meetings_count,
    summary_text: summaryText,
    metrics: {
      lost_reasons: metrics.lost_reasons,
      sample_notes: metrics.sample_notes,
      persisted: false,
    },
    generated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

function makeFallbackTeamReport(
  dateISO: string,
  metrics: DagsavisMetrics,
  summaryText: string,
  sellerRows: ManagerSellerSummary[],
): DailyTeamReport {
  return {
    id: `fallback-team-${dateISO}`,
    report_date: dateISO,
    calls_count: metrics.calls_count,
    meetings_confirmed: metrics.meetings_confirmed,
    sales_count: metrics.sales_count,
    rejections_count: metrics.rejections_count,
    revenue_amount: metrics.revenue_amount,
    new_customers_count: metrics.new_customers_count,
    booked_meetings_count: metrics.booked_meetings_count,
    summary_text: summaryText,
    metrics: {
      lost_reasons: metrics.lost_reasons,
      sample_notes: metrics.sample_notes,
      sellers: sellerRows,
      persisted: false,
    },
    generated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

function formatReportMoney(value: number | string | null | undefined): string {
  return `${Math.round(Number(value ?? 0)).toLocaleString("nb-NO")} kr`;
}

function reportCards(report: DailyReport | DailyTeamReport) {
  return [
    { label: "Samtaler", value: String(report.calls_count ?? 0) },
    { label: "Salg", value: String(report.sales_count ?? 0) },
    { label: "Omsetning", value: formatReportMoney(report.revenue_amount) },
    { label: "Nye kunder", value: String(report.new_customers_count ?? 0) },
    { label: "Bookede møter", value: String(report.booked_meetings_count ?? 0) },
    { label: "Avslag", value: String(report.rejections_count ?? 0) },
  ];
}

async function sendDagsavisSms(to: string, text: string): Promise<DagsavisSendResult> {
  if (process.env.DAGSAVIS_SMS_ENABLED !== "true") {
    console.log(`[dry-run] Dagsavis-SMS til ${to}: ${text.slice(0, 140)}`);
    return { channel: "sms", to, provider: "dry-run", provider_ref: null };
  }
  if (!isSmsConfigured()) {
    return {
      channel: "sms",
      to,
      provider: getSmsProvider().id,
      provider_ref: null,
      error: "SMS er ikke konfigurert.",
    };
  }
  const result = await sendSms(to, text, "Dagsavis");
  return {
    channel: "sms",
    to,
    provider: result.provider,
    provider_ref: result.provider_ref,
    error: result.error,
  };
}

async function sendSellerDagsavisEmail(
  agent: Pick<Profile, "id" | "full_name" | "email">,
  report: DailyReport,
): Promise<DagsavisSendResult | null> {
  if (!agent.email) return null;
  const title = `Dagsavis for ${agent.full_name || agent.email}`;
  const intro = `Din daglige oppsummering for ${report.report_date}.`;
  const subject = `Dagsavisen: ${report.report_date}`;
  const cards = reportCards(report);
  const summaryText = report.summary_text || "Ingen oppsummering er tilgjengelig ennå.";
  const result = await sendEmail({
    to: agent.email,
    subject,
    html: dagsavisEmailHtml({
      title,
      intro,
      cards,
      summaryText,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    }),
    text: dagsavisEmailText({ title, cards, summaryText }),
  });

  return {
    channel: "email",
    to: agent.email,
    provider: result.provider,
    provider_ref: result.provider_ref,
    error: result.error,
  };
}

async function sendManagerTeamDagsavisEmail(
  manager: Pick<Profile, "full_name" | "email">,
  report: DailyTeamReport,
  sellerRows: ManagerSellerSummary[],
): Promise<DagsavisSendResult | null> {
  if (!manager.email) return null;
  const title = "Teamets Dagsavis";
  const intro = `Daglig lederoppsummering for hele teamet, ${report.report_date}.`;
  const cards = reportCards(report);
  const summaryText = report.summary_text || "Ingen teamoppsummering er tilgjengelig ennå.";
  const sellerEmailRows = sellerRows.map((row) => ({
    name: row.full_name,
    calls: row.calls_count,
    sales: row.sales_count,
    revenue: formatReportMoney(row.revenue_amount),
    meetings: row.booked_meetings_count,
  }));

  const result = await sendEmail({
    to: manager.email,
    subject: `Teamets Dagsavis: ${report.report_date}`,
    html: dagsavisEmailHtml({
      title,
      intro,
      cards,
      summaryText,
      sellerRows: sellerEmailRows,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    }),
    text: dagsavisEmailText({
      title,
      cards,
      summaryText,
      sellerRows: sellerEmailRows,
    }),
  });

  return {
    channel: "email",
    to: manager.email,
    provider: result.provider,
    provider_ref: result.provider_ref,
    error: result.error,
  };
}

async function getMe() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, me: null };

  const { data: me } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single<Pick<Profile, "id" | "full_name" | "role">>();

  return { user, me };
}

async function upsertSellerReport(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string,
  dateISO: string,
  force: boolean,
) {
  if (!force) {
    const { data: existing, error: existingError } = await admin
      .from("daily_reports")
      .select("*")
      .eq("agent_id", agentId)
      .eq("report_date", dateISO)
      .maybeSingle<DailyReport>();
    if (
      !existingError &&
      existing?.summary_text &&
      !existing.summary_text.toLowerCase().startsWith("kunne ikke generere")
    ) return existing;
  }

  const metrics = await computeMetrics(admin, agentId, dateISO);
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", agentId)
    .single<{ full_name: string; email: string }>();

  let summaryText: string;
  try {
    summaryText = await generateSummary(
      profile?.full_name || profile?.email || "Selger",
      dateISO,
      metrics,
    );
  } catch (error) {
    console.error("Dagsavis seller summary failed:", error);
    summaryText = sellerFallbackSummary(metrics);
  }

  const { data: report, error } = await admin
    .from("daily_reports")
    .upsert(
      toDailyReportRow(agentId, dateISO, metrics, summaryText),
      { onConflict: "agent_id,report_date" },
    )
    .select("*")
    .single<DailyReport>();

  if (error) {
    console.error("Dagsavis seller report persist failed:", error);
    return makeFallbackSellerReport(agentId, dateISO, metrics, summaryText);
  }
  return report;
}

async function upsertTeamReport(
  admin: ReturnType<typeof createAdminClient>,
  dateISO: string,
  force: boolean,
) {
  if (!force) {
    const { data: existing, error: existingError } = await admin
      .from("daily_team_reports")
      .select("*")
      .eq("report_date", dateISO)
      .maybeSingle<DailyTeamReport>();
    if (
      !existingError &&
      existing?.summary_text &&
      !existing.summary_text.toLowerCase().startsWith("kunne ikke generere")
    ) return existing;
  }

  const bounds = dayBounds(dateISO);
  const metrics = await computeRangeMetrics(admin, null, bounds.start, bounds.end);

  const sellerRows = await computeManagerRows(admin, "dag", dateISO);

  let summaryText: string;
  try {
    summaryText = await generateTeamSummary(dateISO, metrics, sellerRows);
  } catch (error) {
    console.error("Dagsavis team summary failed:", error);
    summaryText = teamFallbackSummary(metrics, sellerRows);
  }

  const { data: report, error } = await admin
    .from("daily_team_reports")
    .upsert(toTeamReportRow(dateISO, metrics, summaryText, sellerRows), {
      onConflict: "report_date",
    })
    .select("*")
    .single<DailyTeamReport>();

  if (error) {
    console.error("Dagsavis team report persist failed:", error);
    return makeFallbackTeamReport(dateISO, metrics, summaryText, sellerRows);
  }
  return report;
}

export async function POST(req: NextRequest) {
  const { user, me } = await getMe();
  if (!user) {
    return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  }

  const limited = await enforceRateLimit(req, {
    name: "dagsavis",
    limit: 15,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const isManager = me?.role === "manager";
  const scope: DagsavisScope = body.scope === "team" && isManager ? "team" : "agent";
  const period: DagsavisPeriod = body.period === "uke" ? "uke" : "dag";
  const force = Boolean(body.force);
  const requestedAgentId =
    scope === "agent" && body.agent_id && isManager ? body.agent_id : user.id;

  if (scope === "team" && !isManager) {
    return NextResponse.json({ error: "Kun leder kan se team-avis" }, { status: 403 });
  }

  const admin = createAdminClient();
  const reportDate = body.date ?? todayISO();

  const report =
    scope === "team"
      ? await upsertTeamReport(admin, reportDate, force)
      : await upsertSellerReport(admin, requestedAgentId, reportDate, force);

  const chart = await computeSeries(
    admin,
    scope === "team" ? null : requestedAgentId,
    period,
    reportDate,
  );

  const managerRows = isManager
    ? await computeManagerRows(admin, period, reportDate)
    : null;

  const teamReport = isManager
    ? scope === "team"
      ? (report as DailyTeamReport)
      : await upsertTeamReport(admin, reportDate, force)
    : null;

  const agents = isManager
    ? ((await admin
        .from("profiles")
        .select("id, full_name, email")
        .eq("role", "agent")
        .eq("is_active", true)
        .order("full_name")).data ?? []) as Pick<
        Profile,
        "id" | "full_name" | "email"
      >[]
    : [];

  const cards = buildDagsavisSections(report as DailyReport);

  const payload: DagsavisResponse = {
    scope,
    report_date: reportDate,
    report,
    cards,
    chart,
    team_report: teamReport,
    manager_rows: managerRows,
    agents,
    quote_of_the_day: getQuoteOfTheDay(reportDate),
  };

  return NextResponse.json(payload);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const { hour: localHour, minute: localMinute } = getTimeInTimeZone(
    now,
    "Europe/Oslo",
  );

  if (localHour !== 20 || localMinute !== 0) {
    return NextResponse.json({
      skipped: true,
      reason: "Not local 20:00 in Europe/Oslo",
    });
  }

  const admin = createAdminClient();
  const dateISO = todayISO();

  const { data: agents } = await admin
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("role", "agent")
    .eq("is_active", true);

  const activeAgents = (agents ?? []) as Array<
    Pick<Profile, "id" | "full_name" | "email"> & { phone?: string | null }
  >;

  const sellerReports = await Promise.all(
    activeAgents.map((agent) => upsertSellerReport(admin, agent.id, dateISO, true)),
  );
  const teamReport = await upsertTeamReport(admin, dateISO, true);
  const sellerRows = await computeManagerRows(admin, "dag", dateISO);

  const { data: managers } = await admin
    .from("profiles")
    .select("full_name, email, phone")
    .eq("role", "manager")
    .eq("is_active", true);

  const emailResults = (
    await Promise.all([
      ...activeAgents.map((agent, index) =>
        sendSellerDagsavisEmail(agent, sellerReports[index] as DailyReport),
      ),
      ...(((managers ?? []) as Array<Pick<Profile, "full_name" | "email">>).map(
        (manager) => sendManagerTeamDagsavisEmail(manager, teamReport, sellerRows),
      )),
    ])
  ).filter((result): result is DagsavisSendResult => Boolean(result));

  const smsResults =
    process.env.DAGSAVIS_SMS_ENABLED === "true"
      ? (
          await Promise.all([
            ...activeAgents
              .filter((agent) => Boolean(agent.phone))
              .map((agent, index) => {
                const report = sellerReports[index] as DailyReport;
                return sendDagsavisSms(
                  agent.phone as string,
                  `Dagsavisen ${dateISO}: ${report.summary_text || "Rapporten er klar."}`,
                );
              }),
            ...((managers ?? []) as Array<{ phone?: string | null }>)
              .filter((manager) => Boolean(manager.phone))
              .map((manager) =>
                sendDagsavisSms(
                  manager.phone as string,
                  `Teamets Dagsavis ${dateISO}: ${teamReport.summary_text || "Rapporten er klar."}`,
                ),
              ),
          ])
        )
      : [];

  return NextResponse.json({
    ok: true,
    date: dateISO,
    sellers: sellerReports.length,
    team_report_id: teamReport.id,
    email_sent: emailResults.filter((result) => !result.error).length,
    email_errors: emailResults.filter((result) => result.error),
    sms_sent: smsResults.filter((result) => !result.error).length,
    sms_mode:
      process.env.DAGSAVIS_SMS_ENABLED === "true"
        ? isSmsConfigured()
          ? "provider"
          : "dry-run"
        : "disabled",
  });
}
