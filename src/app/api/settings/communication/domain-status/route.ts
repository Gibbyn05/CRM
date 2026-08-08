import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getResendDomainStatus, extractDomain, isEmailConfigured } from "@/lib/email";
import type { Organization } from "@/lib/types";

// ============================================================================
//  Ekte SPF/DKIM/DMARC-status hentet fra Resend (ikke egne DNS-oppslag).
//  Kontrollerer også at det konfigurerte avsenderdomenet faktisk er domenet
//  som er autentisert hos leverandøren.
// ============================================================================

export async function GET(req: NextRequest) {
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
    name: "settings:communication:domain-status",
    limit: 30,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  if (!isEmailConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: "RESEND_API_KEY er ikke satt.",
      domains: [],
    });
  }

  const { data: org } = await supabase
    .from("organization")
    .select("email_from_address")
    .eq("id", 1)
    .maybeSingle<Pick<Organization, "email_from_address">>();

  const configuredDomain = org?.email_from_address
    ? extractDomain(org.email_from_address)
    : null;

  const result = await getResendDomainStatus();

  const configuredDomainMatches = configuredDomain
    ? result.domains.some((d) => d.name === configuredDomain && d.status === "verified")
    : false;

  return NextResponse.json({
    ok: result.ok,
    configured: true,
    error: result.error,
    domains: result.domains,
    configured_domain: configuredDomain,
    configured_domain_verified: configuredDomainMatches,
  });
}
