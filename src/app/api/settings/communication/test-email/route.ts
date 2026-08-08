import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  sendEmail,
  isEmailConfigured,
  extractDomain,
  getResendDomainStatus,
  RESEND_SHARED_TEST_DOMAIN,
} from "@/lib/email";
import type { Organization } from "@/lib/types";

// ============================================================================
//  Sender en ekte kontrollmail via gjeldende oppsett og rapporterer
//  leverandørens faktiske svar. Viser ALDRI falsk suksess: uten
//  RESEND_API_KEY returneres "ikke konfigurert" i stedet for å late som
//  meldingen ble sendt.
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
    name: "settings:communication:test-email",
    limit: 10,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = body.to?.trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "Oppgi en gyldig mottaker-adresse." }, { status: 400 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: "E-post er ikke konfigurert (mangler RESEND_API_KEY).",
    });
  }

  const { data: org } = await supabase
    .from("organization")
    .select("email_from_name, email_from_address, email_reply_to")
    .eq("id", 1)
    .maybeSingle<Pick<Organization, "email_from_name" | "email_from_address" | "email_reply_to">>();

  const fromAddress = org?.email_from_address?.trim();
  const from = fromAddress
    ? `${org?.email_from_name?.trim() || "Salgssentral"} <${fromAddress}>`
    : undefined; // faller tilbake til EMAIL_FROM/DEFAULT_FROM i sendEmail()

  const domain = fromAddress ? extractDomain(fromAddress) : null;

  const result = await sendEmail({
    to,
    subject: "Testmelding fra CRM – kontroll av e-postoppsett",
    html: `<p>Dette er en kontrollmelding sendt fra CRM-ets e-postoppsett.</p><p>Avsenderdomene: <strong>${domain ?? RESEND_SHARED_TEST_DOMAIN}</strong></p>`,
    text: `Dette er en kontrollmelding sendt fra CRM-ets e-postoppsett.\nAvsenderdomene: ${domain ?? RESEND_SHARED_TEST_DOMAIN}`,
    replyTo: org?.email_reply_to?.trim() || undefined,
    from,
  });

  const domainStatus = await getResendDomainStatus();
  const matchedDomain = domainStatus.domains.find((d) => d.name === domain);

  return NextResponse.json({
    ok: !result.error,
    configured: true,
    provider: result.provider,
    provider_ref: result.provider_ref,
    error: result.error,
    sender_domain: domain ?? RESEND_SHARED_TEST_DOMAIN,
    using_shared_test_domain: !domain,
    domain_status: matchedDomain
      ? { status: matchedDomain.status, records: matchedDomain.records }
      : null,
  });
}
