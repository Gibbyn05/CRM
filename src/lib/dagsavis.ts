import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, addWeeks } from "date-fns";
import { generateOpenAIText } from "./openai";
import type { DailyReport, DailyTeamReport, Profile } from "./types";

export const DAGSAVIS_TIME_ZONE = "Europe/Oslo";

export type DagsavisPeriod = "dag" | "uke";

export interface DagsavisMetrics {
  calls_count: number;
  meetings_confirmed: number;
  sales_count: number;
  revenue_amount: number;
  new_customers_count: number;
  booked_meetings_count: number;
  rejections_count: number;
  lost_reasons: string[];
  sample_notes: string[];
}

export interface DagsavisSection {
  key: string;
  label: string;
  value: number;
  tone?: "neutral" | "positive" | "warning" | "negative";
  suffix?: string;
  hint?: string;
}

export function getQuoteOfTheDay(dateISO = todayISO()): string {
  const quotes = [
    "Den neste samtalen kan være dagens beste. Ring den med fullt nærvær.",
    "Mot kommer før resultatet. Løft røret og skap muligheten.",
    "Hvert nei bringer teamet nærmere det riktige ja-et.",
    "God energi høres gjennom telefonen. Ta den med inn i første setning.",
    "Du trenger ikke vinne hele dagen nå. Vinn den neste samtalen.",
    "Spør godt, lytt skarpt og gjør neste steg enkelt for kunden.",
    "Tempo skaper muligheter. Kvalitet gjør mulighetene til salg.",
    "En tydelig samtale kan snu både kundens dag og din egen.",
    "Resultater bygges én oppringning, én oppfølging og ett ja av gangen.",
    "Tro på verdien du tilbyr. Kunden merker forskjellen.",
    "Dagens mål starter ikke i rapporten. Det starter med neste nummer.",
    "Hold laget høyt, hold aktiviteten oppe og feir fremgangen underveis.",
    "Nysgjerrighet åpner døren. Gode spørsmål holder samtalen i gang.",
    "Vær den selgeren som følger opp én gang til når andre gir seg.",
  ];
  const dayNumber = Math.floor(
    new Date(`${dateISO}T12:00:00Z`).getTime() / 86_400_000,
  );
  return quotes[Math.abs(dayNumber) % quotes.length];
}

export interface DagsavisSeriesPoint {
  key: string;
  label: string;
  calls_count: number;
  sales_count: number;
}

export interface ManagerSellerSummary {
  agent_id: string;
  full_name: string;
  email: string;
  calls_count: number;
  meetings_confirmed: number;
  sales_count: number;
  revenue_amount: number;
  new_customers_count: number;
  booked_meetings_count: number;
  rejections_count: number;
  delta_calls_count: number;
  delta_sales_count: number;
  delta_revenue_amount: number;
  delta_new_customers_count: number;
  delta_booked_meetings_count: number;
  delta_rejections_count: number;
}

const DEFAULT_LABEL = "Ukjent";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateParts(date: Date, timeZone = DAGSAVIS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year ?? 1970),
    month: Number(map.month ?? 1),
    day: Number(map.day ?? 1),
    hour: Number(map.hour ?? 0),
    minute: Number(map.minute ?? 0),
    second: Number(map.second ?? 0),
  };
}

export function toDateISOInTimeZone(
  date = new Date(),
  timeZone = DAGSAVIS_TIME_ZONE,
): string {
  const { year, month, day } = formatDateParts(date, timeZone);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function getTimeInTimeZone(
  date = new Date(),
  timeZone = DAGSAVIS_TIME_ZONE,
): { hour: number; minute: number } {
  const { hour, minute } = formatDateParts(date, timeZone);
  return { hour, minute };
}

function localDateTimeToUtcISO(
  dateISO: string,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = DAGSAVIS_TIME_ZONE,
): string {
  const [year, month, day] = dateISO.split("-").map((value) => Number(value));
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const localParts = formatDateParts(utcGuess, timeZone);
  const localAsUtcMs = Date.UTC(
    localParts.year,
    localParts.month - 1,
    localParts.day,
    localParts.hour,
    localParts.minute,
    localParts.second,
  );
  const offsetMs = localAsUtcMs - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs).toISOString();
}

function localAnchor(dateISO: string): Date {
  return new Date(`${dateISO}T12:00:00Z`);
}

function addLocalDaysISO(dateISO: string, amount: number): string {
  return toDateISOInTimeZone(addDays(localAnchor(dateISO), amount));
}

function addLocalWeeksISO(dateISO: string, amount: number): string {
  return toDateISOInTimeZone(addWeeks(localAnchor(dateISO), amount));
}

function startOfLocalWeekISO(dateISO: string): string {
  const anchor = localAnchor(dateISO);
  const dayIndex = (anchor.getUTCDay() + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - dayIndex);
  return toDateISOInTimeZone(anchor);
}

function formatDayLabel(dateISO: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: DAGSAVIS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${dateISO}T12:00:00Z`));
}

function formatWeekLabel(startISO: string): string {
  const endISO = addLocalDaysISO(startISO, 6);
  return `${formatDayLabel(startISO)}–${formatDayLabel(endISO)}`;
}

export function yesterdayISO(timeZone = DAGSAVIS_TIME_ZONE): string {
  return addLocalDaysISO(toDateISOInTimeZone(new Date(), timeZone), -1);
}

export function todayISO(timeZone = DAGSAVIS_TIME_ZONE): string {
  return toDateISOInTimeZone(new Date(), timeZone);
}

export function dayBounds(dateISO: string): { start: string; end: string } {
  return {
    start: localDateTimeToUtcISO(dateISO, 0, 0, 0),
    end: localDateTimeToUtcISO(addLocalDaysISO(dateISO, 1), 0, 0, 0),
  };
}

export function getPeriodWindow(
  period: DagsavisPeriod,
  referenceDateISO = todayISO(),
): { startISO: string; endISO: string; bucketCount: number } {
  if (period === "dag") {
    const endISO = addLocalDaysISO(referenceDateISO, 1);
    const startISO = addLocalDaysISO(referenceDateISO, -13);
    return { startISO, endISO, bucketCount: 14 };
  }

  const endISO = addLocalWeeksISO(startOfLocalWeekISO(referenceDateISO), 1);
  const startISO = addLocalWeeksISO(startOfLocalWeekISO(referenceDateISO), -11);
  return { startISO, endISO, bucketCount: 12 };
}

function toRangeLabel(period: DagsavisPeriod, dateISO: string): string {
  if (period === "dag") return formatDayLabel(dateISO);
  return formatWeekLabel(dateISO);
}

function localBucketKey(
  dateISO: string,
  period: DagsavisPeriod,
): string {
  if (period === "dag") return dateISO;
  return startOfLocalWeekISO(dateISO);
}

export interface DagsavisCardDefinition {
  key: keyof Pick<
    DagsavisMetrics,
    "calls_count" | "sales_count" | "revenue_amount" | "new_customers_count" | "booked_meetings_count"
  >;
  label: string;
  tone: "neutral" | "positive" | "warning" | "negative";
  suffix?: string;
}

export const DAGSAVIS_CARD_DEFINITIONS: DagsavisCardDefinition[] = [
  {
    key: "calls_count",
    label: "Samtaler",
    tone: "neutral" as const,
  },
  {
    key: "sales_count",
    label: "Salg",
    tone: "positive" as const,
  },
  {
    key: "revenue_amount",
    label: "Omsetning",
    tone: "positive" as const,
    suffix: " kr",
  },
  {
    key: "new_customers_count",
    label: "Nye kunder",
    tone: "neutral" as const,
  },
  {
    key: "booked_meetings_count",
    label: "Bookede møter",
    tone: "warning" as const,
  },
] as const;

async function queryMetrics(
  supabase: SupabaseClient,
  range: { startISO: string; endISO: string },
  agentId?: string | null,
): Promise<DagsavisMetrics> {
  const agentFilter = agentId ? { field: "agent_id", value: agentId } : null;
  const authorFilter = agentId ? { field: "author_id", value: agentId } : null;

  const callsQuery = supabase
    .from("call_logs")
    .select("id", { count: "exact", head: true })
    .gte("started_at", range.startISO)
    .lt("started_at", range.endISO);
  if (agentFilter) callsQuery.eq(agentFilter.field, agentFilter.value);

  const confirmedMeetingsQuery = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("status", "bekreftet")
    .gte("starts_at", range.startISO)
    .lt("starts_at", range.endISO);
  if (agentFilter) confirmedMeetingsQuery.eq(agentFilter.field, agentFilter.value);

  const salesQuery = supabase
    .from("deals")
    .select("amount, lost_reason", { count: "exact" })
    .eq("stage", "akseptert")
    .gte("offer_accepted_at", range.startISO)
    .lt("offer_accepted_at", range.endISO);
  if (agentFilter) salesQuery.eq(agentFilter.field, agentFilter.value);

  const rejectionsQuery = supabase
    .from("deals")
    .select("lost_reason")
    .eq("stage", "tapt")
    .gte("updated_at", range.startISO)
    .lt("updated_at", range.endISO);
  if (agentFilter) rejectionsQuery.eq(agentFilter.field, agentFilter.value);

  const customersQuery = supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .gte("created_at", range.startISO)
    .lt("created_at", range.endISO);
  if (agentId) {
    customersQuery.or(
      `created_by.eq.${agentId},owner_id.eq.${agentId}`,
    );
  }

  const bookedMeetingsQuery = supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .gte("created_at", range.startISO)
    .lt("created_at", range.endISO);
  if (agentFilter) bookedMeetingsQuery.eq(agentFilter.field, agentFilter.value);

  const notesQuery = supabase
    .from("notes")
    .select("body")
    .gte("created_at", range.startISO)
    .lt("created_at", range.endISO)
    .limit(40);
  if (authorFilter) notesQuery.eq(authorFilter.field, authorFilter.value);

  const [calls, confirmedMeetings, sales, rejections, customers, bookedMeetings, notes] =
    await Promise.all([
      callsQuery,
      confirmedMeetingsQuery,
      salesQuery,
      rejectionsQuery,
      customersQuery,
      bookedMeetingsQuery,
      notesQuery,
    ]);

  const salesRows = ((sales.data ?? []) as { amount: number | string | null }[])
    .map((row) => Number(row.amount ?? 0));
  const rejectionsRows = ((rejections.data ?? []) as { lost_reason: string | null }[])
    .map((row) => row.lost_reason)
    .filter((row): row is string => Boolean(row && row.trim()));
  const sampleNotes = ((notes.data ?? []) as { body: string }[])
    .map((row) => row.body.trim())
    .filter(Boolean)
    .slice(0, 20);

  return {
    calls_count: calls.count ?? 0,
    meetings_confirmed: confirmedMeetings.count ?? 0,
    sales_count: sales.count ?? 0,
    revenue_amount: salesRows.reduce((sum, value) => sum + value, 0),
    new_customers_count: customers.count ?? 0,
    booked_meetings_count: bookedMeetings.count ?? 0,
    rejections_count: rejections.count ?? 0,
    lost_reasons: Array.from(new Set(rejectionsRows)).slice(0, 10),
    sample_notes: sampleNotes,
  };
}

export async function computeMetrics(
  supabase: SupabaseClient,
  agentId: string,
  dateISO: string,
): Promise<DagsavisMetrics> {
  const bounds = dayBounds(dateISO);
  return queryMetrics(
    supabase,
    { startISO: bounds.start, endISO: bounds.end },
    agentId,
  );
}

export async function computeRangeMetrics(
  supabase: SupabaseClient,
  agentId: string | null,
  startISO: string,
  endISO: string,
): Promise<DagsavisMetrics> {
  return queryMetrics(supabase, { startISO, endISO }, agentId);
}

export function buildDagsavisSections(
  metrics: Pick<
    DagsavisMetrics,
    | "calls_count"
    | "sales_count"
    | "revenue_amount"
    | "new_customers_count"
    | "booked_meetings_count"
  >,
): DagsavisSection[] {
  return DAGSAVIS_CARD_DEFINITIONS.map((card) => {
    const value = metrics[card.key];
    return {
      key: card.key,
      label: card.label,
      value: typeof value === "number" ? value : 0,
      tone: card.tone,
      suffix: card.suffix,
    };
  });
}

function buildBucketSeries(
  rows: Array<{ timestamp: string | null }>,
  period: DagsavisPeriod,
  startISO: string,
  endISO: string,
  valueKey: "calls_count" | "sales_count",
) {
  const buckets = new Map<
    string,
    { key: string; label: string; calls_count: number; sales_count: number }
  >();

  let cursor = startISO;
  while (cursor < endISO) {
    buckets.set(cursor, {
      key: cursor,
      label: toRangeLabel(period, cursor),
      calls_count: 0,
      sales_count: 0,
    });
    cursor = period === "dag" ? addLocalDaysISO(cursor, 1) : addLocalWeeksISO(cursor, 1);
  }

  for (const row of rows) {
    if (!row.timestamp) continue;
    const localDateISO = toDateISOInTimeZone(new Date(row.timestamp));
    const key = localBucketKey(localDateISO, period);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket[valueKey] += 1;
  }

  return Array.from(buckets.values());
}

export async function computeSeries(
  supabase: SupabaseClient,
  agentId: string | null,
  period: DagsavisPeriod,
  referenceDateISO = todayISO(),
): Promise<DagsavisSeriesPoint[]> {
  const window = getPeriodWindow(period, referenceDateISO);
  const callsQuery = supabase
    .from("call_logs")
    .select("started_at")
    .gte("started_at", localDateTimeToUtcISO(window.startISO))
    .lt("started_at", localDateTimeToUtcISO(window.endISO));
  if (agentId) callsQuery.eq("agent_id", agentId);

  const salesQuery = supabase
    .from("deals")
    .select("offer_accepted_at")
    .eq("stage", "akseptert")
    .gte("offer_accepted_at", localDateTimeToUtcISO(window.startISO))
    .lt("offer_accepted_at", localDateTimeToUtcISO(window.endISO));
  if (agentId) salesQuery.eq("agent_id", agentId);

  const [calls, sales] = await Promise.all([callsQuery, salesQuery]);

  const callsBuckets = buildBucketSeries(
    (calls.data ?? []).map((row) => ({ timestamp: row.started_at })) as {
      timestamp: string | null;
    }[],
    period,
    window.startISO,
    window.endISO,
    "calls_count",
  );

  const salesBuckets = buildBucketSeries(
    (sales.data ?? []).map((row) => ({ timestamp: row.offer_accepted_at })) as {
      timestamp: string | null;
    }[],
    period,
    window.startISO,
    window.endISO,
    "sales_count",
  );

  return callsBuckets.map((bucket, index) => ({
    key: bucket.key,
    label: bucket.label,
    calls_count: bucket.calls_count,
    sales_count: salesBuckets[index]?.sales_count ?? 0,
  }));
}

function formatDelta(base: number, previous: number): number {
  return base - previous;
}

export async function computeManagerRows(
  supabase: SupabaseClient,
  period: DagsavisPeriod,
  referenceDateISO = todayISO(),
): Promise<ManagerSellerSummary[]> {
  const currentWindow = period === "dag"
    ? {
        startISO: referenceDateISO,
        endISO: addLocalDaysISO(referenceDateISO, 1),
      }
    : {
        startISO: startOfLocalWeekISO(referenceDateISO),
        endISO: addLocalWeeksISO(startOfLocalWeekISO(referenceDateISO), 1),
      };
  const previousWindow = period === "dag"
    ? {
        startISO: addLocalDaysISO(referenceDateISO, -1),
        endISO: referenceDateISO,
      }
    : {
        startISO: addLocalWeeksISO(currentWindow.startISO, -1),
        endISO: currentWindow.startISO,
      };

  const { data: agents } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("role", "agent")
    .eq("is_active", true)
    .order("full_name");

  const activeAgents = ((agents ?? []) as Pick<Profile, "id" | "full_name" | "email">[]).filter(
    (agent) => Boolean(agent.id),
  );

  const rows = await Promise.all(
    activeAgents.map(async (agent) => {
      const [current, previous] = await Promise.all([
        computeRangeMetrics(
          supabase,
          agent.id,
          localDateTimeToUtcISO(currentWindow.startISO),
          localDateTimeToUtcISO(currentWindow.endISO),
        ),
        computeRangeMetrics(
          supabase,
          agent.id,
          localDateTimeToUtcISO(previousWindow.startISO),
          localDateTimeToUtcISO(previousWindow.endISO),
        ),
      ]);

      return {
        agent_id: agent.id,
        full_name: agent.full_name || agent.email || DEFAULT_LABEL,
        email: agent.email || "",
        calls_count: current.calls_count,
        meetings_confirmed: current.meetings_confirmed,
        sales_count: current.sales_count,
        revenue_amount: current.revenue_amount,
        new_customers_count: current.new_customers_count,
        booked_meetings_count: current.booked_meetings_count,
        rejections_count: current.rejections_count,
        delta_calls_count: formatDelta(current.calls_count, previous.calls_count),
        delta_sales_count: formatDelta(current.sales_count, previous.sales_count),
        delta_revenue_amount: formatDelta(
          current.revenue_amount,
          previous.revenue_amount,
        ),
        delta_new_customers_count: formatDelta(
          current.new_customers_count,
          previous.new_customers_count,
        ),
        delta_booked_meetings_count: formatDelta(
          current.booked_meetings_count,
          previous.booked_meetings_count,
        ),
        delta_rejections_count: formatDelta(
          current.rejections_count,
          previous.rejections_count,
        ),
      };
    }),
  );

  return rows.sort((a, b) => b.revenue_amount - a.revenue_amount);
}

function topNotesText(notes: string[]): string {
  return notes.length ? notes.map((note) => `- ${note}`).join("\n") : "- (ingen notater)";
}

function topReasonsText(reasons: string[]): string {
  return reasons.length ? reasons.map((reason) => `- ${reason}`).join("\n") : "- (ingen registrert)";
}

export async function generateSummary(
  agentName: string,
  dateISO: string,
  metrics: DagsavisMetrics,
): Promise<string> {
  const prompt = `Skriv en kort, poengtert dagsavis på norsk til selgeren ${agentName} om gårsdagens (${dateISO}) prestasjon.

Nøkkeltall:
- Samtaler: ${metrics.calls_count}
- Salg: ${metrics.sales_count}
- Omsetning: ${metrics.revenue_amount.toFixed(0)} kr
- Nye kunder: ${metrics.new_customers_count}
- Bookede møter: ${metrics.booked_meetings_count}
- Bekreftede møter: ${metrics.meetings_confirmed}
- Avslag: ${metrics.rejections_count}

Årsaker til tapte kunder:
${topReasonsText(metrics.lost_reasons)}

Loggnotater fra samtalene:
${topNotesText(metrics.sample_notes)}

Krav til teksten:
- Maks 3–4 korte setninger. Kom rett til poenget.
- Åpne med hovedbildet av gårsdagen.
- Pek på hvor i salgsprosessen kunder ser ut til å glippe hvis data gir grunnlag for det.
- Avslutt med ett konkret, handlingsrettet tips til i dag.
- Ingen emoji, ingen klisjeer, ingen peptalk-fyll, ingen overskrift.
- Skriv i sammenhengende prosa, ikke punktliste.`;

  const text = await generateOpenAIText({
    instructions:
      "Du er en erfaren salgscoach i et norsk callcenter. Skriv presist, konkret og uten fyll. Bruk norsk bokmål.",
    input: prompt,
    maxOutputTokens: 380,
  });

  return text || "Kunne ikke generere oppsummering.";
}

export async function generateTeamSummary(
  dateISO: string,
  metrics: DagsavisMetrics,
  sellerRows: ManagerSellerSummary[],
): Promise<string> {
  const topRows = sellerRows.slice(0, 5);
  const sellerLines = topRows.length
    ? topRows
        .map(
          (row) =>
            `- ${row.full_name}: ${row.sales_count} salg, ${row.revenue_amount.toFixed(0)} kr, ${row.calls_count} samtaler`,
        )
        .join("\n")
    : "- (ingen aktive selgere)";

  const prompt = `Skriv en kort team-oppsummering for utgaven datert ${dateISO}.

Teamtall:
- Samtaler: ${metrics.calls_count}
- Salg: ${metrics.sales_count}
- Omsetning: ${metrics.revenue_amount.toFixed(0)} kr
- Nye kunder: ${metrics.new_customers_count}
- Bookede møter: ${metrics.booked_meetings_count}
- Bekreftede møter: ${metrics.meetings_confirmed}
- Avslag: ${metrics.rejections_count}

Selgeroversikt:
${sellerLines}

Krav til teksten:
- 4–5 korte setninger.
- Start med totalbildet for teamet.
- Pek på hvilken type aktivitet som drar resultatet opp eller ned.
- Hvis en selger skiller seg tydelig ut, nevn det kort og konkret.
- Avslutt med ett presist tiltak som lederne kan bruke i morgen.
- Ingen overskrift, ingen punktliste, ingen klisjeer.`;

  const text = await generateOpenAIText({
    instructions:
      "Du er en erfaren salgssjef i et norsk callcenter. Skriv presist, konkret og uten fyll. Bruk norsk bokmål.",
    input: prompt,
    maxOutputTokens: 440,
  });

  return text || "Kunne ikke generere teamoppsummering.";
}

export function toDailyReportRow(
  agentId: string,
  dateISO: string,
  metrics: DagsavisMetrics,
  summaryText: string,
): Partial<DailyReport> {
  return {
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
    },
    generated_at: new Date().toISOString(),
  };
}

export function toTeamReportRow(
  dateISO: string,
  metrics: DagsavisMetrics,
  summaryText: string,
  sellerRows: ManagerSellerSummary[],
): Partial<DailyTeamReport> {
  return {
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
    },
    generated_at: new Date().toISOString(),
  };
}
