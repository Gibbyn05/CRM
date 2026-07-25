import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, CLAUDE_MODEL } from "./anthropic";

// ============================================================================
//  Dagsavis: beregner gårsdagens nøkkeltall for en selger og genererer en kort,
//  lesbar AI-oppsummering med Claude.
//
//  "Hvor i samtalen mistet flest kunder" er en enkel første versjon basert på
//  loggnotater og statusendringer (tapte deals + lost_reason). Datamodellen
//  (call_logs.raw_payload, notes.note_type, deals.stage) er designet for å
//  utvides med detaljert samtaledata senere.
// ============================================================================

export interface DagsavisMetrics {
  calls_count: number;
  meetings_confirmed: number;
  sales_count: number;
  rejections_count: number;
  lost_reasons: string[];
  sample_notes: string[];
}

export function dayBounds(dateISO: string): { start: string; end: string } {
  const start = new Date(`${dateISO}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

// Beregner nøkkeltall for en agent på en gitt dato (YYYY-MM-DD).
export async function computeMetrics(
  supabase: SupabaseClient,
  agentId: string,
  dateISO: string,
): Promise<DagsavisMetrics> {
  const { start, end } = dayBounds(dateISO);

  const [calls, meetings, sales, rejections, notes] = await Promise.all([
    supabase
      .from("call_logs")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .gte("started_at", start)
      .lt("started_at", end),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("status", "bekreftet")
      .gte("starts_at", start)
      .lt("starts_at", end),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("stage", "akseptert")
      .gte("offer_accepted_at", start)
      .lt("offer_accepted_at", end),
    supabase
      .from("deals")
      .select("lost_reason")
      .eq("agent_id", agentId)
      .eq("stage", "tapt")
      .gte("updated_at", start)
      .lt("updated_at", end),
    supabase
      .from("notes")
      .select("body, note_type")
      .eq("author_id", agentId)
      .gte("created_at", start)
      .lt("created_at", end)
      .limit(40),
  ]);

  const lostReasons = ((rejections.data as { lost_reason: string | null }[]) ?? [])
    .map((r) => r.lost_reason)
    .filter((r): r is string => !!r);

  const sampleNotes = ((notes.data as { body: string }[]) ?? [])
    .map((n) => n.body)
    .slice(0, 20);

  return {
    calls_count: calls.count ?? 0,
    meetings_confirmed: meetings.count ?? 0,
    sales_count: sales.count ?? 0,
    rejections_count: rejections.count ?? 0,
    lost_reasons: lostReasons,
    sample_notes: sampleNotes,
  };
}

// Genererer AI-oppsummering med Claude basert på tallene og loggnotatene.
export async function generateSummary(
  agentName: string,
  dateISO: string,
  metrics: DagsavisMetrics,
): Promise<string> {
  const prompt = `Du er en erfaren salgscoach i et norsk callcenter. Skriv en kort, poengtert dagsavis på norsk til selgeren ${agentName} om gårsdagens (${dateISO}) prestasjon.

Nøkkeltall:
- Telefoner ringt: ${metrics.calls_count}
- Bekreftede møter: ${metrics.meetings_confirmed}
- Salg: ${metrics.sales_count}
- Avslag: ${metrics.rejections_count}

Årsaker til tapte kunder (fritekst):
${metrics.lost_reasons.length ? metrics.lost_reasons.map((r) => `- ${r}`).join("\n") : "- (ingen registrert)"}

Loggnotater fra samtalene:
${metrics.sample_notes.length ? metrics.sample_notes.map((n) => `- ${n}`).join("\n") : "- (ingen notater)"}

Krav til teksten:
- Maks 3–4 korte setninger. Kom rett til poenget.
- Åpne med hovedbildet av gårsdagen (ett kort utsagn).
- Pek på hvor i salgsprosessen kunder ser ut til å glippe HVIS notater/avslagsårsaker gir grunnlag for det. Har du ikke data, hopp over det – ikke fyll med generelle betraktninger.
- Avslutt med ÉTT konkret, handlingsrettet tips til i dag.
- Ingen emoji, ingen klisjeer, ingen peptalk-fyll, ingen overskrift. Ikke gjenta tallene mekanisk – tolk dem kort.
- Skriv i sammenhengende prosa (ikke punktliste).`;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text || "Kunne ikke generere oppsummering.";
}
