import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendSms, isSmsConfigured, getSmsProvider } from "@/lib/providers/sms";
import type { Organization } from "@/lib/types";

// ============================================================================
//  Sender en ekte kontroll-SMS via gjeldende leverandøroppsett og rapporterer
//  det faktiske svaret. Viser ALDRI falsk suksess uten konfigurert
//  leverandør eller ved avvisning.
// ============================================================================

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
    name: "settings:communication:test-sms",
    limit: 10,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = body.to?.trim();
  if (!to) {
    return NextResponse.json({ error: "Oppgi et mottakernummer." }, { status: 400 });
  }

  if (!isSmsConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      provider: getSmsProvider().id,
      error: "SMS er ikke konfigurert (mangler leverandør-nøkler i miljøvariabler).",
    });
  }

  const { data: org } = await supabase
    .from("organization")
    .select("sms_from_name")
    .eq("id", 1)
    .maybeSingle<Pick<Organization, "sms_from_name">>();

  const result = await sendSms(
    to,
    "Testmelding fra CRM: SMS-oppsettet virker.",
    org?.sms_from_name?.trim() || "CRM",
  );

  return NextResponse.json({
    ok: result.ok,
    configured: true,
    provider: result.provider,
    provider_ref: result.provider_ref,
    error: result.error,
  });
}
