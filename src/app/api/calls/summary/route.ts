import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import type { CallTranscript } from "@/lib/types";

// ============================================================================
//  Lager et kort AI-sammendrag + forslag til neste steg fra live-transkriptet
//  for kundens siste samtale, og lagrer det som et notat på kunden (note_type
//  'call') slik at det dukker opp i loggen.
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
      { error: "AI-sammendrag er ikke konfigurert (mangler ANTHROPIC_API_KEY)." },
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

  // Hent siste transkript-segmenter for kunden (nyeste først), og avgrens til
  // den siste samtalen når vi har en call_log_id.
  const { data: recent } = await supabase
    .from("call_transcripts")
    .select("*")
    .eq("customer_id", body.customer_id)
    .order("spoken_at", { ascending: false })
    .limit(120);

  const rows = (recent as CallTranscript[]) ?? [];
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Ingen transkript å oppsummere ennå." },
      { status: 422 },
    );
  }

  const latestCall = rows[0].call_log_id;
  const callRows = latestCall
    ? rows.filter((r) => r.call_log_id === latestCall)
    : rows;
  // Kronologisk rekkefølge for lesbarhet.
  callRows.reverse();

  const label: Record<string, string> = {
    agent: "Selger",
    customer: "Kunde",
    system: "System",
  };
  const transcript = callRows
    .map((r) => `${label[r.speaker] ?? "—"}: ${r.text}`)
    .join("\n");

  const prompt = `Du er en salgsassistent. Under er et transkript fra en salgssamtale (norsk B2B). Lag et kort sammendrag og ett konkret neste steg.

Transkript:
${transcript}

Svar på norsk i nøyaktig dette formatet, uten annet:
SAMMENDRAG: <2–3 korte setninger om hva som ble sagt og resultatet>
NESTE STEG: <én konkret oppfølgingshandling>`;

  let summary = "";
  let nextStep = "";
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
    const sMatch = text.match(/SAMMENDRAG:\s*([\s\S]*?)(?:\nNESTE STEG:|$)/i);
    const nMatch = text.match(/NESTE STEG:\s*([\s\S]*)$/i);
    summary = (sMatch?.[1] ?? text).trim();
    nextStep = (nMatch?.[1] ?? "").trim();
  } catch (e) {
    const m = e instanceof Error ? e.message : "Ukjent feil";
    return NextResponse.json({ error: "Feil ved sammendrag: " + m }, { status: 502 });
  }

  const noteBody = `🤖 AI-sammendrag av samtale\n${summary}${
    nextStep ? `\n\nNeste steg: ${nextStep}` : ""
  }`;

  // Lagre som notat (RLS: author_id må være innlogget bruker).
  const { error: insErr } = await supabase.from("notes").insert({
    customer_id: body.customer_id,
    author_id: user.id,
    call_log_id: latestCall,
    note_type: "call",
    body: noteBody,
  });
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, summary, next_step: nextStep });
}
