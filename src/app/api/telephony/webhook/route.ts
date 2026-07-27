import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { CallDirection } from "@/lib/types";

// ============================================================================
//  Abstrahert telefoni-webhook / event-endepunkt.
//
//  Tar imot normaliserte samtale-hendelser fra en ekstern telefoni-kilde.
//  Integrasjonen mot Bria softphone (Desktop API/SDK via Ice) kobles på senere
//  ved å oversette Bria-hendelser til payloaden under og POSTe hit.
//
//  Autentisering: delt hemmelighet i X-Webhook-Secret-headeren
//  (TELEPHONY_WEBHOOK_SECRET).
//
//  Forventet payload (JSON):
//  {
//    "event_type":       "call_started" | "call_answered" | "call_ended" | "call_missed",
//    "external_call_id": "unik-id-fra-telefonikilde",   // idempotens-nøkkel
//    "agent_id":         "uuid",        // valgfritt hvis extension er oppgitt
//    "extension":        "1042",        // mappes til profiles.extension
//    "customer_id":      "uuid",        // valgfritt
//    "phone_number":     "+4790012345", // valgfritt
//    "direction":        "outbound" | "inbound",
//    "occurred_at":      "2026-07-21T09:00:00Z",  // valgfritt (default: now)
//    "raw":              { ... }         // valgfritt, lagres for fremtidig analyse
//  }
// ============================================================================

const VALID_EVENTS = new Set([
  "call_started",
  "call_answered",
  "call_ended",
  "call_missed",
]);

interface TelephonyEvent {
  event_type?: string;
  external_call_id?: string;
  agent_id?: string;
  extension?: string;
  customer_id?: string;
  phone_number?: string;
  direction?: CallDirection;
  occurred_at?: string;
  raw?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  // 0) Rate limit pr. IP (maskin-til-maskin, romslig grense).
  const limited = await enforceRateLimit(req, {
    name: "telephony:webhook",
    limit: 600,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // 1) Verifiser delt hemmelighet.
  const secret = req.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.TELEPHONY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  }

  // 2) Parse og valider payload.
  let body: TelephonyEvent;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  if (!body.event_type || !VALID_EVENTS.has(body.event_type)) {
    return NextResponse.json(
      { error: `Ukjent event_type. Forventet én av: ${[...VALID_EVENTS].join(", ")}` },
      { status: 400 },
    );
  }

  if (!body.external_call_id) {
    return NextResponse.json(
      { error: "external_call_id er påkrevd" },
      { status: 400 },
    );
  }

  if (!body.agent_id && !body.extension) {
    return NextResponse.json(
      { error: "agent_id eller extension må oppgis" },
      { status: 400 },
    );
  }

  // 3) Prosesser hendelsen atomisk via RPC (oppdaterer call_logs + agent_states,
  //    som igjen kringkastes til live-tavla via Realtime).
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("process_call_event", {
    p_event_type: body.event_type,
    p_external_call_id: body.external_call_id,
    p_agent_id: body.agent_id ?? null,
    p_extension: body.extension ?? null,
    p_customer_id: body.customer_id ?? null,
    p_phone_number: body.phone_number ?? null,
    p_direction: body.direction ?? "outbound",
    p_occurred_at: body.occurred_at ?? new Date().toISOString(),
    p_raw_payload: body.raw ?? {},
  });

  if (error) {
    console.error("process_call_event feilet:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, call_id: data });
}

// Enkel helsesjekk (nyttig når man kobler til integrasjonen).
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "telephony webhook",
    accepts: [...VALID_EVENTS],
  });
}
