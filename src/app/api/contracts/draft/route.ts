import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";

// ============================================================================
//  Foreslå en kort, profesjonell kontrakt-/tilbudstekst med Claude, basert på
//  kunde, siste deal og noen loggnotater. Returnerer ren tekst som selgeren
//  kan redigere før utsendelse. Skriver ingenting til databasen.
// ============================================================================

interface Body {
  customer_id?: string;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI-forslag er ikke konfigurert (mangler ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }
  if (!body.customer_id) {
    return NextResponse.json({ error: "customer_id er påkrevd" }, { status: 400 });
  }

  const [{ data: customer }, { data: deals }, { data: notes }, { data: me }] =
    await Promise.all([
      supabase.from("customers").select("name, contact_name").eq("id", body.customer_id).single(),
      supabase
        .from("deals")
        .select("title, amount, currency, stage")
        .eq("customer_id", body.customer_id)
        .order("updated_at", { ascending: false })
        .limit(1),
      supabase
        .from("notes")
        .select("body")
        .eq("customer_id", body.customer_id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    ]);

  const deal = (deals as { title: string; amount: number | null; currency: string }[] | null)?.[0];
  const noteLines = ((notes as { body: string }[]) ?? []).map((n) => `- ${n.body}`);

  const prompt = `Skriv en kort, profesjonell og vennlig brødtekst på norsk til en tilbuds-/kontrakt-e-post B2B. Teksten skal stå mellom hilsenen ("Hei ...") og en "Åpne og signer"-knapp, så IKKE skriv hilsen, signatur, emnefelt eller knapp – kun selve brødteksten (2–4 setninger).

Kunde: ${customer?.name ?? "kunden"}${customer?.contact_name ? ` (kontakt: ${customer.contact_name})` : ""}
${deal ? `Tilbud: ${deal.title}${deal.amount ? ` – ${deal.amount} ${deal.currency}` : ""}` : "Tilbud: (ikke spesifisert)"}
${noteLines.length ? `Notater fra samtalene:\n${noteLines.join("\n")}` : ""}

Krav: Vis kort til det vi har snakket om, oppsummer verdien for kunden, og oppfordre til å åpne og signere. Ingen emoji, ingen klisjeer, ingen overdrivelser. Svar KUN med brødteksten.`;

  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return NextResponse.json({
      message: text,
      sender: (me as { full_name: string } | null)?.full_name ?? null,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Ukjent feil";
    return NextResponse.json({ error: "Feil ved forslag: " + m }, { status: 502 });
  }
}
