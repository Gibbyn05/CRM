import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TranscriptSpeaker } from "@/lib/types";

// ============================================================================
//  Live transkript-sink for ICE-integrasjonen.
//
//  ICE (eller en mellomtjeneste som lytter på samtalelyd + tale-til-tekst)
//  POSTer transkript-segmenter hit mens samtalen pågår. Vi kobler segmentet til
//  riktig call_log via external_call_id (samme id som telefoni-webhooken bruker)
//  og skriver til call_transcripts – Realtime kringkaster det så til UI-et.
//
//  Autentiseres med samme delte hemmelighet som telefoni-webhooken
//  (X-Webhook-Secret = TELEPHONY_WEBHOOK_SECRET).
//
//  Forventet body:
//  {
//    "external_call_id": "abc-123",     // påkrevd – knytter til samtalen
//    "text": "Hei, dette er ...",       // påkrevd – tekstsegmentet
//    "speaker": "agent" | "customer" | "system",  // valgfritt (default system)
//    "is_final": true,                  // valgfritt – delresultat vs endelig
//    "seq": 12,                          // valgfritt – rekkefølge
//    "spoken_at": "2026-07-25T10:00:00Z" // valgfritt
//  }
// ============================================================================

interface Body {
  external_call_id?: string;
  text?: string;
  speaker?: TranscriptSpeaker;
  is_final?: boolean;
  seq?: number;
  spoken_at?: string;
  agent_id?: string;
  customer_id?: string;
}

const SPEAKERS = new Set<TranscriptSpeaker>(["agent", "customer", "system"]);

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (!process.env.TELEPHONY_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Webhook ikke konfigurert (mangler TELEPHONY_WEBHOOK_SECRET)." },
      { status: 503 },
    );
  }
  if (secret !== process.env.TELEPHONY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Ugyldig hemmelighet" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  if (!body.external_call_id || !body.text?.trim()) {
    return NextResponse.json(
      { error: "external_call_id og text er påkrevd" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Koble til eksisterende samtale for å arve agent/kunde.
  const { data: call } = await admin
    .from("call_logs")
    .select("id, agent_id, customer_id")
    .eq("external_call_id", body.external_call_id)
    .maybeSingle();

  const speaker: TranscriptSpeaker =
    body.speaker && SPEAKERS.has(body.speaker) ? body.speaker : "system";

  const { data, error } = await admin
    .from("call_transcripts")
    .insert({
      call_log_id: call?.id ?? null,
      external_call_id: body.external_call_id,
      agent_id: body.agent_id ?? call?.agent_id ?? null,
      customer_id: body.customer_id ?? call?.customer_id ?? null,
      speaker,
      text: body.text.trim(),
      is_final: body.is_final ?? true,
      seq: body.seq ?? null,
      spoken_at: body.spoken_at ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
