import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";

// ============================================================================
//  Mottak av samtaleopptak fra den lokale telefoni-broen.
//
//  Broen (på selgerens PC) laster opp lydfila for en avsluttet samtale, merket
//  med external_call_id + agent_id. Vi transkriberer med en tale-til-tekst-
//  tjeneste (OpenAI Whisper når OPENAI_API_KEY er satt) og lagrer teksten som
//  call_transcripts, koblet til samtalen. Deretter kan «Oppsummer med AI» på
//  kundekortet lage et sammendrag – eller vi kan utvide til å gjøre det her.
//
//  Autentiseres med samme delte hemmelighet som resten av telefoni-API-et
//  (X-Webhook-Secret = TELEPHONY_WEBHOOK_SECRET).
//
//  NB: Vercel serverless har ~4,5 MB grense på request-body. Bruk komprimert
//  lyd (mp3/opus) fra broen, eller last store filer via Supabase Storage i en
//  senere versjon.
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 60;

interface WhisperSegment {
  start: number;
  text: string;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, {
    name: "telephony:recording",
    limit: 120,
    windowSeconds: 60,
  });
  if (limited) return limited;

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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Forventet multipart/form-data" }, { status: 400 });
  }

  const externalCallId = String(form.get("external_call_id") ?? "").trim();
  const agentIdField = form.get("agent_id");
  const audio = form.get("audio");

  if (!externalCallId) {
    return NextResponse.json({ error: "external_call_id er påkrevd" }, { status: 400 });
  }
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "audio-fil mangler" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Koble til samtalen for å arve agent/kunde.
  const { data: call } = await admin
    .from("call_logs")
    .select("id, agent_id, customer_id, started_at")
    .eq("external_call_id", externalCallId)
    .maybeSingle();

  const agentId =
    (typeof agentIdField === "string" && agentIdField) || call?.agent_id || null;
  const baseTime = call?.started_at
    ? new Date(call.started_at as string).getTime()
    : Date.now();

  // Transkriber – hvis STT ikke er konfigurert, lagre et hint og returner OK
  // (så broen ikke prøver på nytt i det uendelige).
  if (!process.env.OPENAI_API_KEY) {
    await admin.from("call_transcripts").insert({
      call_log_id: call?.id ?? null,
      external_call_id: externalCallId,
      agent_id: agentId,
      customer_id: call?.customer_id ?? null,
      speaker: "system",
      text: "[Opptak mottatt, men transkribering er ikke konfigurert (mangler OPENAI_API_KEY).]",
      is_final: true,
    });
    return NextResponse.json({ ok: true, transcribed: false });
  }

  let segments: WhisperSegment[] = [];
  let fullText = "";
  try {
    const stt = new FormData();
    stt.append("file", audio, audio.name || "recording.wav");
    stt.append("model", "whisper-1");
    stt.append("language", "no");
    stt.append("response_format", "verbose_json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: stt,
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: "Transkribering feilet: " + detail.slice(0, 300) },
        { status: 502 },
      );
    }
    const json = (await res.json()) as { text?: string; segments?: WhisperSegment[] };
    fullText = (json.text ?? "").trim();
    segments = Array.isArray(json.segments) ? json.segments : [];
  } catch (e) {
    const m = e instanceof Error ? e.message : "Ukjent feil";
    return NextResponse.json({ error: "Transkribering feilet: " + m }, { status: 502 });
  }

  if (!fullText && segments.length === 0) {
    return NextResponse.json({ ok: true, transcribed: false, empty: true });
  }

  // Lagre som segmenter (pen visning i live-transkriptet), ev. som én rad.
  const rows =
    segments.length > 0
      ? segments.slice(0, 500).map((s, i) => ({
          call_log_id: call?.id ?? null,
          external_call_id: externalCallId,
          agent_id: agentId,
          customer_id: call?.customer_id ?? null,
          speaker: "system" as const,
          text: s.text.trim(),
          is_final: true,
          seq: i,
          spoken_at: new Date(baseTime + Math.round((s.start ?? 0) * 1000)).toISOString(),
        }))
      : [
          {
            call_log_id: call?.id ?? null,
            external_call_id: externalCallId,
            agent_id: agentId,
            customer_id: call?.customer_id ?? null,
            speaker: "system" as const,
            text: fullText,
            is_final: true,
            seq: 0,
            spoken_at: new Date(baseTime).toISOString(),
          },
        ];

  const { error } = await admin.from("call_transcripts").insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    transcribed: true,
    segments: rows.length,
    linked_call: call?.id ?? null,
  });
}
