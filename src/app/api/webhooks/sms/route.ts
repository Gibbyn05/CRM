import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";

// ============================================================================
//  Mottar leveransekvittering fra SMS-leverandøren, HVIS den støtter det.
//
//  MERK: Sveve sin offentlige dokumentasjon for leveranse-webhooks er ikke
//  verifisert i denne økten — payload-formatet under (`provider_ref`,
//  `status`) er en generisk, rimelig antagelse og MÅ tilpasses leverandørens
//  faktiske format før dette kan stoles på. Inntil da har feltet ingen
//  praktisk effekt utover at planlagte påminnelser fortsatt får status
//  "sent" fra den synkrone sende-kallet (se /api/reminders/sms/dispatch).
//
//  Autentisering: delt hemmelighet i X-Webhook-Secret (SMS_WEBHOOK_SECRET) –
//  samme mønster som den eksisterende telefoni-webhooken.
// ============================================================================

interface SmsWebhookBody {
  provider_ref?: string;
  status?: string; // f.eks. "delivered" | "failed"
  error?: string;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, {
    name: "webhooks:sms",
    limit: 300,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const secret = req.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.SMS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  }
  if (!process.env.SMS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Webhook ikke konfigurert" }, { status: 503 });
  }

  let body: SmsWebhookBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }
  if (!body.provider_ref) {
    return NextResponse.json({ error: "Mangler provider_ref" }, { status: 400 });
  }

  const admin = createAdminClient();
  const status = body.status === "delivered" ? "delivered" : body.status === "failed" ? "failed" : null;
  if (!status) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  await admin
    .from("appointment_sms_reminders")
    .update({ status, error: body.error ?? null })
    .eq("provider_ref", body.provider_ref)
    .in("status", ["sent"]); // ikke overskriv en allerede endelig status

  return NextResponse.json({ ok: true });
}
