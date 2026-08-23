import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendEmail, contractEmailHtml } from "@/lib/email";
import { getPublicAppUrl } from "@/lib/app-url";
import { sendContractSentCopies } from "@/lib/contract-signing-email";

// ============================================================================
//  POST /api/contracts/sign-request   body: { deal_id, recipient? }
//
//  Sender tilbudets kontrakt til kunden for enkel elektronisk signering:
//   1) lager en contracts-rad (status «sent») med et øyeblikksbilde av
//      avtaleteksten og et offentlig sign_token,
//   2) sender kunden en e-post med lenke til /signer/<token>.
//
//  Kunden signerer på den offentlige siden (skriver navn + aksepterer), og
//  /api/signer/<token> setter status «signed». Tillatt for tilbudets eier
//  eller ledere.
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  deal_id?: string;
  recipient?: string;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "contracts:sign-request",
    limit: 20,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }
  if (!body.deal_id) {
    return NextResponse.json({ error: "deal_id er påkrevd" }, { status: 400 });
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();
  const { data: deal } = await admin
    .from("deals")
    .select(
      "id, title, agent_id, customer_id, contract_text, contract_template_id, contract_generation_data, agreement_end, customer:customers(name, email)",
    )
    .eq("id", body.deal_id)
    .single();
  if (!deal) {
    return NextResponse.json({ error: "Fant ikke tilbudet" }, { status: 404 });
  }
  if (me?.role !== "manager" && deal.agent_id !== user.id) {
    return NextResponse.json({ error: "Ikke tilgang" }, { status: 403 });
  }

  const customer = (Array.isArray(deal.customer)
    ? deal.customer[0]
    : deal.customer) as { name: string | null; email: string | null } | null;

  const recipient = (body.recipient?.trim() || customer?.email || "").trim();
  if (!recipient) {
    return NextResponse.json(
      { error: "Kunden mangler e-postadresse. Legg til e-post på kunden først." },
      { status: 400 },
    );
  }

  const contractText = (deal.contract_text ?? "").trim();
  if (!contractText) {
    return NextResponse.json(
      {
        error:
          "Tilbudet mangler kontraktstekst. Åpne salget og lag/lim inn kontrakten før du sender til signering.",
      },
      { status: 400 },
    );
  }

  const agreementEnd = deal.agreement_end;
  if (!agreementEnd) {
    return NextResponse.json(
      { error: "Kontrakten mangler sluttdato. Oppdater kontrakten før den sendes til signering." },
      { status: 400 },
    );
  }

  // 1) Opprett kontrakt-rad med øyeblikksbilde av teksten og eget token.
  const { data: contract, error: insErr } = await admin
    .from("contracts")
    .insert({
      customer_id: deal.customer_id,
      deal_id: deal.id,
      agent_id: user.id,
      channel: "email",
      recipient,
      status: "draft",
      due_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      agreement_end: agreementEnd,
      contract_text: contractText,
      contract_template_id: deal.contract_template_id,
      generation_data: deal.contract_generation_data ?? {},
      approved_at: new Date().toISOString(),
    })
    .select("id, sign_token")
    .single();
  if (insErr || !contract) {
    return NextResponse.json(
      { error: insErr?.message ?? "Kunne ikke opprette kontrakt." },
      { status: 500 },
    );
  }

  // Branding fra «Min organisasjon».
  const { data: org } = await admin
    .from("organization")
    .select("name, logo_url, contract_footer")
    .eq("id", 1)
    .maybeSingle();
  const brandName =
    (org as { name: string | null } | null)?.name?.trim() || undefined;

  const appUrl = getPublicAppUrl();
  const signUrl = `${appUrl}/signer/${contract.sign_token}`;

  // 2) Send e-post med signeringslenke.
  const result = await sendEmail({
    to: recipient,
    subject: `Signer avtale${brandName ? " – " + brandName : ""}`,
    html: contractEmailHtml({
      customerName: customer?.name ?? "der",
      signUrl,
      senderName: me?.full_name || undefined,
      bodyText:
        "Her er avtalen for signering. Klikk under for å lese gjennom og signere elektronisk. Det tar under ett minutt.",
      orgName: brandName,
      logoUrl: (org as { logo_url: string | null } | null)?.logo_url || undefined,
      footer:
        (org as { contract_footer: string | null } | null)?.contract_footer ||
        undefined,
    }),
    text: `Hei ${customer?.name ?? "der"},\n\nHer er avtalen for signering. Åpne og signer her: ${signUrl}`,
  });

  if (result.error) {
    // La kontrakten stå som kladd og meld fra.
    return NextResponse.json(
      { error: "Kunne ikke sende e-post: " + result.error },
      { status: 502 },
    );
  }

  const copies = await sendContractSentCopies(admin, {
    id: contract.id,
    agent_id: deal.agent_id,
    contract_text: contractText,
    customer_name: customer?.name ?? "kunde",
    customer_email: recipient,
  });

  // 3) Marker som sendt.
  await admin
    .from("contracts")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      provider: result.provider,
      provider_ref: result.provider_ref,
    })
    .eq("id", contract.id);

  return NextResponse.json({
    ok: true,
    recipient,
    sign_url: signUrl,
    copies_sent: copies.sent,
    copies_failed: copies.failed,
  });
}
