import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { SmsReminderRecipients } from "@/lib/types";

// ============================================================================
//  Lagrer ikke-sensitiv kommunikasjonskonfigurasjon (Innstillinger →
//  Kommunikasjon). Ekte API-nøkler/hemmeligheter lagres ALDRI her — kun
//  avsendernavn, domener, svaradresse, maler og påminnelsesregler. Kun
//  ledere kan lagre, og hver lagring logges i settings_audit_log.
// ============================================================================

const RECIPIENT_VALUES: SmsReminderRecipients[] = ["customer", "agent", "both"];

interface Body {
  timezone?: string;
  email_from_name?: string;
  email_from_address?: string;
  email_reply_to?: string;
  email_link_domain?: string;
  sms_from_name?: string;
  sms_default_phone?: string;
  sms_reminders_enabled?: boolean;
  sms_reminder_recipients?: SmsReminderRecipients;
  sms_reminder_offsets_hours?: number[];
  sms_template_customer?: string;
  sms_template_agent?: string;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "settings:communication:save",
    limit: 20,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "manager") {
    return NextResponse.json({ error: "Kun ledere kan endre kommunikasjonsoppsettet." }, { status: 403 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  if (body.email_from_address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email_from_address)) {
    return NextResponse.json({ error: "Ugyldig avsenderadresse." }, { status: 400 });
  }
  if (body.email_reply_to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email_reply_to)) {
    return NextResponse.json({ error: "Ugyldig svaradresse." }, { status: 400 });
  }
  if (
    body.sms_reminder_recipients &&
    !RECIPIENT_VALUES.includes(body.sms_reminder_recipients)
  ) {
    return NextResponse.json({ error: "Ugyldig verdi for mottakere." }, { status: 400 });
  }
  const offsets = body.sms_reminder_offsets_hours;
  if (
    offsets !== undefined &&
    (!Array.isArray(offsets) ||
      offsets.length === 0 ||
      offsets.some((h) => !Number.isFinite(h) || h <= 0 || h > 720))
  ) {
    return NextResponse.json(
      { error: "Ugyldige tidspunkt for påminnelser (må være positive timer, maks 720)." },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = { updated_by: user.id };
  const fields: (keyof Body)[] = [
    "timezone",
    "email_from_name",
    "email_from_address",
    "email_reply_to",
    "email_link_domain",
    "sms_from_name",
    "sms_default_phone",
    "sms_reminders_enabled",
    "sms_reminder_recipients",
    "sms_reminder_offsets_hours",
    "sms_template_customer",
    "sms_template_agent",
  ];
  for (const f of fields) {
    if (body[f] !== undefined) patch[f] = body[f];
  }

  const { data, error } = await supabase
    .from("organization")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("settings_audit_log").insert({
    actor_id: user.id,
    area: "communication",
    summary: `Endret felt: ${Object.keys(patch).filter((k) => k !== "updated_by").join(", ") || "(ingen)"}`,
  });

  return NextResponse.json({ organization: data });
}
