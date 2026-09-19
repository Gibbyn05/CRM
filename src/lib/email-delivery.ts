import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, type SendEmailInput, type SendEmailResult } from "./email";

export type EmailDeliveryCategory =
  | "contract"
  | "contract_copy"
  | "contract_expiry"
  | "invitation"
  | "daily_report"
  | "system";

export interface EmailDeliveryContext {
  category: EmailDeliveryCategory;
  contractId?: string | null;
  invitationId?: string | null;
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
}

function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

// Sender og lagrer alltid utsendingsforsøket. En hard bounce eller spamklage
// stopper nye meldinger til adressen før de forlater CRM-et.
export async function sendTrackedEmail(
  admin: SupabaseClient,
  email: SendEmailInput,
  context: EmailDeliveryContext,
): Promise<SendEmailResult> {
  const recipient = normaliseEmail(email.to);
  const { data: suppression, error: suppressionError } = await admin
    .from("email_suppressions")
    .select("reason")
    .eq("email", recipient)
    .maybeSingle();

  if (suppressionError) {
    console.error("Kunne ikke kontrollere e-postsperre:", suppressionError.message);
  }

  if (suppression) {
    const result: SendEmailResult = {
      provider: "crm",
      provider_ref: null,
      error: `Adressen er sperret etter ${suppression.reason === "complaint" ? "spamklage" : "permanent avvisning"}.`,
    };
    await recordDelivery(admin, email, context, result, recipient);
    return result;
  }

  const result = await sendEmail({ ...email, to: recipient });
  await recordDelivery(admin, email, context, result, recipient);
  return result;
}

async function recordDelivery(
  admin: SupabaseClient,
  email: SendEmailInput,
  context: EmailDeliveryContext,
  result: SendEmailResult,
  recipient: string,
) {
  const now = new Date().toISOString();
  const { error } = await admin.from("email_delivery_records").insert({
    provider: result.provider,
    provider_message_id: result.provider_ref,
    category: context.category,
    recipient,
    subject: email.subject,
    status: result.error ? "failed" : "sent",
    contract_id: context.contractId ?? null,
    invitation_id: context.invitationId ?? null,
    created_by: context.createdBy ?? null,
    error_message: result.error ?? null,
    metadata: context.metadata ?? {},
    sent_at: result.error ? null : now,
    last_event_at: result.error ? null : now,
  });
  if (error) console.error("Kunne ikke lagre e-postlevering:", error.message);
}

export async function recordOperationsAudit(
  admin: SupabaseClient,
  input: {
    actorId?: string | null;
    category: "access" | "email" | "recovery" | "configuration";
    action: string;
    summary: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("operations_audit_events").insert({
    actor_id: input.actorId ?? null,
    category: input.category,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });
  if (error) console.error("Kunne ikke lagre driftshendelse:", error.message);
}
