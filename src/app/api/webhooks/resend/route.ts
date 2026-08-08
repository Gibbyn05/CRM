import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyResendWebhookSignature } from "@/lib/email";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { EmailEventType } from "@/lib/types";

// ============================================================================
//  Mottar leveransehendelser fra Resend (sendt/levert/avvist/spamklage/åpnet).
//  Signaturen verifiseres (Svix-format, se lib/email.ts) FØR noe leses fra
//  body. Harde avvisninger og spamklager legges automatisk i sperrelisten.
//
//  MERK: nøyaktige felt-/typenavn i Resends webhook-payload bør verifiseres
//  mot deres gjeldende dokumentasjon når webhooken faktisk kobles til —
//  parsingen under er defensiv (mangler felt => hendelsen logges likevel,
//  bare uten den detaljen), men er ikke testet mot en ekte Resend-konto i
//  denne økten.
//  Docs: https://resend.com/docs/dashboard/webhooks/event-types
// ============================================================================

const EVENT_TYPE_MAP: Record<string, EmailEventType> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "soft_bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  // "email.bounced" håndteres separat under (kan være hard eller soft).
};

interface ResendWebhookBody {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string; message?: string };
  };
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, {
    name: "webhooks:resend",
    limit: 300,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET er ikke satt — avviser webhook.");
    return NextResponse.json({ error: "Webhook ikke konfigurert" }, { status: 503 });
  }

  const payload = await req.text();
  const valid = verifyResendWebhookSignature({
    payload,
    svixId: req.headers.get("svix-id"),
    svixTimestamp: req.headers.get("svix-timestamp"),
    svixSignature: req.headers.get("svix-signature"),
    secret,
  });
  if (!valid) {
    return NextResponse.json({ error: "Ugyldig signatur" }, { status: 401 });
  }

  let body: ResendWebhookBody;
  try {
    body = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const type = body.type ?? "";
  const messageId = body.data?.email_id ?? null;
  const recipient = Array.isArray(body.data?.to) ? body.data?.to?.[0] : body.data?.to;

  let eventType: EmailEventType | null = EVENT_TYPE_MAP[type] ?? null;
  let suppressReason: "hard_bounce" | "complaint" | null = null;

  if (type === "email.bounced") {
    const bounceType = body.data?.bounce?.type?.toLowerCase() ?? "";
    const isPermanent = bounceType.includes("perman") || bounceType.includes("hard");
    eventType = isPermanent ? "hard_bounced" : "soft_bounced";
    if (isPermanent) suppressReason = "hard_bounce";
  } else if (type === "email.complained") {
    suppressReason = "complaint";
  }

  if (!eventType) {
    // Ukjent/uinteressant hendelsestype — kvitter OK slik at leverandøren
    // ikke prøver på nytt, men logger ingenting.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();

  // Slå opp hvilken kontrakt dette gjelder (provider_ref = Resend sin id).
  let contractId: string | null = null;
  let agentId: string | null = null;
  if (messageId) {
    const { data: contract } = await admin
      .from("contracts")
      .select("id, agent_id")
      .eq("provider_ref", messageId)
      .maybeSingle();
    contractId = contract?.id ?? null;
    agentId = contract?.agent_id ?? null;
  }

  await admin.from("email_events").insert({
    contract_id: contractId,
    recipient: recipient ?? "ukjent",
    event_type: eventType,
    provider: "resend",
    provider_message_id: messageId,
    meta: body.data ?? {},
    occurred_at: body.created_at ?? new Date().toISOString(),
  });

  if (suppressReason && recipient) {
    await admin
      .from("email_suppressions")
      .upsert(
        { email: recipient.toLowerCase().trim(), reason: suppressReason, source: "resend_webhook" },
        { onConflict: "email" },
      );
  }

  // Varsle selgeren når en viktig melding ikke kan leveres.
  if ((eventType === "hard_bounced" || eventType === "complained") && agentId) {
    await admin.from("notifications").insert({
      user_id: agentId,
      type: "contract",
      title: eventType === "hard_bounced" ? "E-post kunne ikke leveres" : "Mottaker klagde på e-post",
      body: `${recipient ?? "Mottaker"}: ${
        eventType === "hard_bounced" ? "permanent avvist av mottakers e-postserver" : "markert som spam"
      }.`,
      link: contractId ? `/customers` : null,
    });
  }

  return NextResponse.json({ ok: true });
}
