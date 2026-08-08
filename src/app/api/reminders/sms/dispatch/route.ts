import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendSms } from "@/lib/providers/sms";
import { buildReminderVars, renderReminderSms } from "@/lib/sms-templates";
import { computeBackoffMinutes, shouldRetry } from "@/lib/reminder-dispatch";
import type { Organization } from "@/lib/types";

// ============================================================================
//  Sikker bakgrunnsjobb: sender alle forfalte SMS-avtalepåminnelser.
//
//  To autentiseringsveier (samme mønster som /api/regnskap/sync):
//   - Cron (Vercel): GET med "Authorization: Bearer <CRON_SECRET>".
//   - Leder-sesjon: POST fra Kommunikasjon-innstillingene ("Kjør nå").
//
//  Kontrollert retry: midlertidige feil (nettverk/5xx) utsetter meldingen med
//  eksponentiell backoff i stedet for å gi opp umiddelbart. Samtykke og
//  telefonnummer sjekkes PÅ NYTT her (ikke bare da påminnelsen ble planlagt),
//  siden kunden kan ha reservert seg i mellomtiden.
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_LIMIT = 100;

interface DueReminderRow {
  id: string;
  recipient_type: "customer" | "agent";
  phone_number: string;
  attempt_count: number;
  appointments: {
    id: string;
    customer_id: string | null;
    agent_id: string;
    starts_at: string;
    location: string | null;
    status: string;
  } | null;
}

async function dispatchDueReminders(admin: ReturnType<typeof createAdminClient>) {
  const nowIso = new Date().toISOString();
  const results = { processed: 0, sent: 0, failed: 0, retried: 0, skipped: 0 };

  const { data: due } = await admin
    .from("appointment_sms_reminders")
    .select(
      "id, recipient_type, phone_number, attempt_count, appointments!inner(id, customer_id, agent_id, starts_at, location, status)",
    )
    .eq("status", "scheduled")
    .lte("send_at", nowIso)
    .limit(BATCH_LIMIT);

  const { data: org } = await admin
    .from("organization")
    .select("*")
    .eq("id", 1)
    .maybeSingle<Organization>();
  const timeZone = org?.timezone || "Europe/Oslo";
  const orgName = org?.name?.trim() || "Salgssentral";

  for (const row of (due as DueReminderRow[] | null) ?? []) {
    results.processed++;
    const appt = row.appointments;

    if (!appt || appt.status === "avlyst") {
      await admin
        .from("appointment_sms_reminders")
        .update({ status: "cancelled" })
        .eq("id", row.id);
      results.skipped++;
      continue;
    }

    let customerName = "kunden";
    if (appt.customer_id) {
      const { data: cust } = await admin
        .from("customers")
        .select("name, phone, sms_opt_out")
        .eq("id", appt.customer_id)
        .maybeSingle();
      customerName = cust?.name ?? "kunden";

      // Behandlingsgrunnlag/samtykke og gyldig nummer må gjelde på
      // sendetidspunktet, ikke bare da påminnelsen ble planlagt.
      if (row.recipient_type === "customer" && (!cust || cust.sms_opt_out || !cust.phone)) {
        await admin
          .from("appointment_sms_reminders")
          .update({
            status: "cancelled",
            error: "Kunden har reservert seg eller mangler telefonnummer.",
          })
          .eq("id", row.id);
        results.skipped++;
        continue;
      }
    }

    const { data: agent } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", appt.agent_id)
      .maybeSingle();

    if (row.recipient_type === "agent" && !agent?.phone) {
      await admin
        .from("appointment_sms_reminders")
        .update({ status: "cancelled", error: "Selger mangler telefonnummer." })
        .eq("id", row.id);
      results.skipped++;
      continue;
    }

    const vars = buildReminderVars({
      customerName,
      agentName: agent?.full_name ?? "",
      startsAtIso: appt.starts_at,
      location: appt.location,
      orgName,
      timeZone,
    });
    const template =
      row.recipient_type === "customer" ? org?.sms_template_customer : org?.sms_template_agent;
    const text = renderReminderSms(template, row.recipient_type, vars);

    const sendResult = await sendSms(row.phone_number, text, org?.sms_from_name?.trim() || orgName);
    const nextAttempt = row.attempt_count + 1;

    if (sendResult.ok) {
      await admin
        .from("appointment_sms_reminders")
        .update({
          status: "sent",
          provider: sendResult.provider,
          provider_ref: sendResult.provider_ref,
          error: null,
          attempt_count: nextAttempt,
        })
        .eq("id", row.id);
      results.sent++;
      continue;
    }

    if (shouldRetry(sendResult.transient, nextAttempt)) {
      const backoffMinutes = computeBackoffMinutes(row.attempt_count);
      await admin
        .from("appointment_sms_reminders")
        .update({
          attempt_count: nextAttempt,
          error: sendResult.error,
          send_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
        })
        .eq("id", row.id);
      results.retried++;
      continue;
    }

    await admin
      .from("appointment_sms_reminders")
      .update({ status: "failed", attempt_count: nextAttempt, error: sendResult.error })
      .eq("id", row.id);
    results.failed++;

    await admin.from("notifications").insert({
      user_id: appt.agent_id,
      type: "reminder",
      title: "SMS-påminnelse kunne ikke sendes",
      body: `${row.recipient_type === "customer" ? customerName : "Din egen påminnelse"}: ${
        sendResult.error ?? "ukjent feil"
      }`,
      link: "/calendar",
    });
  }

  return results;
}

// Manuell kjøring fra Kommunikasjon-innstillingene (leder-sesjon).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "manager") {
    return NextResponse.json({ error: "Kun ledere" }, { status: 403 });
  }

  const limited = await enforceRateLimit(req, {
    name: "reminders:sms:dispatch",
    limit: 10,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  try {
    const admin = createAdminClient();
    const result = await dispatchDueReminders(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Ukjent feil";
    console.error("SMS-dispatch (manuell) feilet:", m);
    return NextResponse.json({ error: m }, { status: 502 });
  }
}

// Vercel Cron: "Authorization: Bearer <CRON_SECRET>" (se vercel.json).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const result = await dispatchDueReminders(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Ukjent feil";
    console.error("SMS-dispatch (cron) feilet:", m);
    return NextResponse.json({ error: m }, { status: 502 });
  }
}
