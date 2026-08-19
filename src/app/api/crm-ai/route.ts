import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { classifyCrmQuestion, formatRange, resolveQuestionRange } from "@/lib/crm-ai";
import { generateOpenAIText, OPENAI_CRM_MODEL } from "@/lib/openai";

export const dynamic = "force-dynamic";

type Source = { label: string; href?: string };

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Du må logge inn." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "manager") {
    return NextResponse.json({ error: "Kun ledelsen har tilgang til Spør CRM." }, { status: 403 });
  }
  const limited = await enforceRateLimit(request, {
    name: "crm-ai",
    limit: 20,
    windowSeconds: 300,
    userId: user.id,
  });
  if (limited) return limited;

  const body = await request.json().catch(() => ({})) as { question?: unknown };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 3 || question.length > 600) {
    return NextResponse.json({ error: "Skriv et spørsmål på mellom 3 og 600 tegn." }, { status: 400 });
  }

  try {
    const parsed = await classifyCrmQuestion(question);
    const [start, end] = resolveQuestionRange(parsed);
    const range = formatRange(start, end);

    if (parsed.intent === "customer_history") {
      return customerHistory(supabase, question, parsed.entity, range);
    }
    if (parsed.intent === "pending_followups") {
      return pendingFollowups(supabase, end.toISOString(), range);
    }

    const { data, error } = await supabase.rpc("get_team_analysis", {
      p_start: start.toISOString(),
      p_end: end.toISOString(),
    });
    if (error) throw error;
    const team = (data ?? []) as TeamRow[];
    const selected = parsed.entity
      ? team.filter((row) => row.full_name.toLocaleLowerCase("nb-NO").includes(parsed.entity!.toLocaleLowerCase("nb-NO")))
      : team;

    if (parsed.intent === "seller_sales" && !parsed.entity) {
      return answer("Hvilken selger vil du se salgstall for?", [], range);
    }
    if (parsed.intent === "seller_sales" && !selected.length) {
      return answer(`Jeg fant ingen aktiv selger som matcher «${parsed.entity}».`, [], range);
    }

    const revenue = selected.reduce((sum, row) => sum + Number(row.revenue_amount), 0);
    const offers = selected.reduce((sum, row) => sum + Number(row.offers_count), 0);
    const signed = selected.reduce((sum, row) => sum + Number(row.signed_count), 0);
    const sources: Source[] = [{ label: "Åpne teamanalyse", href: "/team-analysis" }];

    if (parsed.intent === "offers_sent") {
      return answer(`${offers} tilbud ble sendt i perioden ${range}.`, sources, range);
    }
    if (parsed.intent === "closing_rate") {
      const best = [...team]
        .filter((row) => Number(row.offers_count) > 0)
        .sort((a, b) => Number(b.conversion_rate) - Number(a.conversion_rate))[0];
      return answer(
        best
          ? `${best.full_name} har høyest closing rate i perioden: ${Number(best.conversion_rate).toFixed(1)} % (${best.signed_count} signert av ${best.offers_count} tilbud).`
          : `Det finnes ingen sendte tilbud i perioden ${range}.`,
        sources,
        range,
      );
    }
    if (parsed.intent === "seller_sales") {
      return answer(`${selected[0].full_name} har ${selected[0].signed_count} signerte salg med ${formatCurrency(Number(selected[0].revenue_amount))} i omsetning i perioden ${range}.`, sources, range);
    }
    if (parsed.intent === "sales_total") {
      return answer(`Teamet har ${signed} signerte salg med ${formatCurrency(revenue)} i omsetning i perioden ${range}.`, sources, range);
    }
    return answer(`I perioden ${range} har teamet sendt ${offers} tilbud, signert ${signed} salg og registrert ${formatCurrency(revenue)} i omsetning.`, sources, range);
  } catch (error) {
    console.error("crm-ai", error);
    return NextResponse.json({ error: "Jeg klarte ikke å hente et sikkert svar akkurat nå. Prøv igjen." }, { status: 500 });
  }
}

async function customerHistory(
  supabase: ReturnType<typeof createClient>,
  question: string,
  entity: string | null,
  range: string,
) {
  if (!entity) return answer("Hvilken kunde vil du vite mer om? Skriv kundenavnet i spørsmålet.", [], range);
  const safeEntity = entity.replace(/[%,]/g, "");
  const { data: customers } = await supabase.from("customers")
    .select("id,name,contact_name,owner_id")
    .ilike("name", `%${safeEntity}%`).limit(5);
  if (!customers?.length) return answer(`Jeg fant ingen kunde som matcher «${entity}».`, [], range);
  if (customers.length > 1) {
    return answer(`Jeg fant flere mulige kunder: ${customers.map((item) => item.name).join(", ")}. Hvilken mener du?`, [], range);
  }

  const customer = customers[0];
  const [notes, transcripts, messages, calls, reminders, deals] = await Promise.all([
    supabase.from("notes").select("body,note_type,created_at,author_id").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("call_transcripts").select("speaker,text,spoken_at").eq("customer_id", customer.id).eq("is_final", true).order("spoken_at", { ascending: false }).limit(40),
    supabase.from("messages").select("body,channel,created_at,author_id").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("call_logs").select("status,started_at,ended_at,duration_seconds,agent_id").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("reminders").select("title,note,due_at,done,agent_id").eq("customer_id", customer.id).order("due_at", { ascending: false }).limit(8),
    supabase.from("deals").select("title,stage,amount,offer_sent_at,offer_accepted_at,updated_at").eq("customer_id", customer.id).order("updated_at", { ascending: false }).limit(8),
  ]);
  const evidence = {
    notes: notes.data ?? [],
    transcripts: transcripts.data ?? [],
    messages: messages.data ?? [],
    calls: calls.data ?? [],
    reminders: reminders.data ?? [],
    deals: deals.data ?? [],
  };
  const text = await generateOpenAIText({
    instructions: "Svar kort på norsk som CRM-assistent for ledelsen. Bruk bare JSON-dataene. Skill tydelig mellom det som faktisk ble sagt, interne notater og neste steg. Hvis data mangler, si det. Ikke gjett.",
    input: `Spørsmål: ${question}\nKunde: ${customer.name}\nCRM-data: ${JSON.stringify(evidence)}`,
    maxOutputTokens: 520,
    model: OPENAI_CRM_MODEL,
  });
  return answer(text || `Jeg fant historikk for ${customer.name}, men kunne ikke lage et sammendrag.`, [{ label: customer.name, href: `/customers/${customer.id}` }], range);
}

async function pendingFollowups(
  supabase: ReturnType<typeof createClient>,
  endIso: string,
  range: string,
) {
  const { data } = await supabase.from("reminders")
    .select("id,title,note,due_at,customer_id,agent_id,customers(name),profiles!reminders_agent_id_fkey(full_name)")
    .eq("done", false).lte("due_at", endIso).order("due_at", { ascending: true }).limit(100);
  const rows = data ?? [];
  const overdue = rows.filter((row) => new Date(row.due_at) < new Date()).length;
  const details = rows.slice(0, 8).map((row) => {
    const customer = row.customers as unknown as { name?: string } | null;
    const agent = row.profiles as unknown as { full_name?: string } | null;
    return `${customer?.name ?? "Uten kunde"}: ${row.title} (${agent?.full_name ?? "Uten ansvarlig"})`;
  });
  return answer(`${rows.length} oppfølginger er fortsatt åpne, hvorav ${overdue} har passert fristen.${details.length ? `\n\nNærmest frist:\n• ${details.join("\n• ")}` : ""}`, [{ label: "Åpne påminnelser", href: "/reminders" }], range);
}

interface TeamRow {
  agent_id: string;
  full_name: string;
  offers_count: number;
  signed_count: number;
  revenue_amount: number;
  conversion_rate: number;
}

function answer(text: string, sources: Source[], period: string) {
  return NextResponse.json({ answer: text, sources, period });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 }).format(value);
}
