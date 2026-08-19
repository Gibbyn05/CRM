import { endOfDay, startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";
import { generateOpenAIText, OPENAI_CRM_MODEL } from "@/lib/openai";

export type CrmAiIntent =
  | "customer_history"
  | "sales_total"
  | "seller_sales"
  | "pending_followups"
  | "offers_sent"
  | "closing_rate"
  | "overview";

export interface CrmAiQuestion {
  intent: CrmAiIntent;
  entity: string | null;
  period: "today" | "week" | "two_weeks" | "month" | "custom";
  start: string | null;
  end: string | null;
}

const ALLOWED_INTENTS = new Set<CrmAiIntent>([
  "customer_history", "sales_total", "seller_sales", "pending_followups",
  "offers_sent", "closing_rate", "overview",
]);

export async function classifyCrmQuestion(question: string): Promise<CrmAiQuestion> {
  const raw = await generateOpenAIText({
    instructions: `Du klassifiserer spørsmål fra en norsk salgsleder til et CRM.
Svar KUN med gyldig JSON uten markdown:
{"intent":"customer_history|sales_total|seller_sales|pending_followups|offers_sent|closing_rate|overview","entity":string|null,"period":"today|week|two_weeks|month|custom","start":"YYYY-MM-DD"|null,"end":"YYYY-MM-DD"|null}
entity er kundenavn for customer_history og selgernavn for seller_sales. Bruk overview når ingen annen kategori passer. Dagens dato i Norge er ${new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date())}.`,
    input: question,
    maxOutputTokens: 180,
    model: OPENAI_CRM_MODEL,
  });
  const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as Partial<CrmAiQuestion>;
  return {
    intent: ALLOWED_INTENTS.has(parsed.intent as CrmAiIntent) ? parsed.intent as CrmAiIntent : "overview",
    entity: typeof parsed.entity === "string" && parsed.entity.trim() ? parsed.entity.trim() : null,
    period: ["today", "week", "two_weeks", "month", "custom"].includes(parsed.period ?? "")
      ? parsed.period as CrmAiQuestion["period"] : "month",
    start: /^\d{4}-\d{2}-\d{2}$/.test(parsed.start ?? "") ? parsed.start! : null,
    end: /^\d{4}-\d{2}-\d{2}$/.test(parsed.end ?? "") ? parsed.end! : null,
  };
}

export function resolveQuestionRange(question: CrmAiQuestion, now = new Date()): [Date, Date] {
  if (question.period === "custom" && question.start && question.end) {
    return [startOfDay(new Date(`${question.start}T12:00:00`)), endOfDay(new Date(`${question.end}T12:00:00`))];
  }
  if (question.period === "today") return [startOfDay(now), endOfDay(now)];
  if (question.period === "week") return [startOfWeek(now, { weekStartsOn: 1 }), endOfDay(now)];
  if (question.period === "two_weeks") return [startOfDay(subDays(now, 13)), endOfDay(now)];
  return [startOfMonth(now), endOfDay(now)];
}

export function formatRange(start: Date, end: Date): string {
  const format = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", year: "numeric" });
  return `${format.format(start)}–${format.format(end)}`;
}
