import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyResendWebhookSignature } from "@/lib/email";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordOperationsAudit } from "@/lib/email-delivery";

// Resend leverer webhooks minst én gang og kan levere samme hendelse flere
// ganger eller i ulik rekkefølge. Svix-id lagres derfor som unik nøkkel, og
// statusen oppdateres kun når hendelsen er nyere enn den vi allerede har.

const EVENT_STATUS: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.failed": "failed",
};

interface ResendWebhookBody {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string; message?: string; subType?: string };
  };
}

function eventStatus(body: ResendWebhookBody): string | null {
  if (body.type === "email.bounced") return "bounced";
  return EVENT_STATUS[body.type ?? ""] ?? null;
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
    console.error("RESEND_WEBHOOK_SECRET er ikke satt. Avviser webhook.");
    return NextResponse.json({ error: "Webhook ikke konfigurert" }, { status: 503 });
  }

  const payload = await req.text();
  const svixId = req.headers.get("svix-id");
  const valid = verifyResendWebhookSignature({
    payload,
    svixId,
    svixTimestamp: req.headers.get("svix-timestamp"),
    svixSignature: req.headers.get("svix-signature"),
    secret,
  });
  if (!valid) return NextResponse.json({ error: "Ugyldig signatur" }, { status: 401 });

  let body: ResendWebhookBody;
  try {
    body = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const status = eventStatus(body);
  if (!status) return NextResponse.json({ ok: true, ignored: true });

  const admin = createAdminClient();
  const messageId = body.data?.email_id ?? null;
  const recipient = Array.isArray(body.data?.to) ? body.data.to[0] : body.data?.to;
  const occurredAt = body.created_at ?? new Date().toISOString();

  // Idempotens: en replay eller nettverksretry skal aldri lage dobbelt
  // leveringshistorikk eller dobbelt varsel.
  const { data: webhookEvent, error: eventError } = await admin
    .from("email_delivery_events")
    .upsert({
      webhook_id: svixId,
      provider: "resend",
      event_type: body.type ?? "unknown",
      occurred_at: occurredAt,
      payload: body.data ?? {},
    }, { onConflict: "webhook_id", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (eventError) {
    console.error("Kunne ikke lagre Resend-webhook:", eventError.message);
    return NextResponse.json({ error: "Kunne ikke lagre webhook" }, { status: 502 });
  }
  if (!webhookEvent) return NextResponse.json({ ok: true, duplicate: true });

  if (!messageId) return NextResponse.json({ ok: true, tracked: false });

  const { data: delivery } = await admin
    .from("email_delivery_records")
    .select("id, status, last_event_at, contract_id, created_by, recipient")
    .eq("provider_message_id", messageId)
    .maybeSingle();
  if (!delivery) return NextResponse.json({ ok: true, tracked: false });

  await admin.from("email_delivery_events")
    .update({ delivery_id: delivery.id })
    .eq("id", webhookEvent.id);

  const eventTime = new Date(occurredAt).getTime();
  const previousTime = delivery.last_event_at ? new Date(delivery.last_event_at).getTime() : 0;
  if (!Number.isNaN(eventTime) && eventTime >= previousTime) {
    const update: Record<string, string | null> = {
      status,
      last_event_at: occurredAt,
    };
    if (status === "failed" || status === "bounced" || status === "complained") {
      update.error_message = body.data?.bounce?.message ??
        (status === "complained" ? "Mottaker markerte e-posten som spam." : "E-post kunne ikke leveres.");
    }
    await admin.from("email_delivery_records").update(update).eq("id", delivery.id);
  }

  const isPermanentBounce = body.type === "email.bounced" &&
    /permanent|hard/i.test(`${body.data?.bounce?.type ?? ""} ${body.data?.bounce?.subType ?? ""}`);
  const isComplaint = body.type === "email.complained";
  const address = (recipient ?? delivery.recipient).trim().toLowerCase();
  if (address && (isPermanentBounce || isComplaint)) {
    await admin.from("email_suppressions").upsert({
      email: address,
      reason: isComplaint ? "complaint" : "hard_bounce",
      source: "resend_webhook",
    }, { onConflict: "email" });
  }

  if ((status === "failed" || status === "bounced" || status === "complained") && delivery.created_by) {
    await admin.from("notifications").insert({
      user_id: delivery.created_by,
      type: "system",
      title: "E-post trenger oppfølging",
      body: `${address || "Mottaker"}: ${status === "complained" ? "markerte e-posten som spam" : "kunne ikke motta e-posten"}.`,
      link: delivery.contract_id ? "/customers" : "/organization?tab=operations",
    });
    await recordOperationsAudit(admin, {
      actorId: delivery.created_by,
      category: "email",
      action: `email_${status}`,
      targetType: "email_delivery",
      targetId: delivery.id,
      summary: `E-post til ${address || "ukjent mottaker"} fikk status ${status}.`,
      metadata: { provider_message_id: messageId, contract_id: delivery.contract_id },
    });
  }

  return NextResponse.json({ ok: true, tracked: true });
}
