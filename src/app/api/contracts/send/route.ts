import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ContractChannel } from "@/lib/types";
import { sendEmail, contractEmailHtml } from "@/lib/email";

// ============================================================================
//  Send kontrakt via e-post eller SMS fra kundekortet.
//
//  E-post går via Resend når RESEND_API_KEY er satt (se src/lib/email.ts),
//  ellers kjøres en "dry-run". SMS er fortsatt stubbet – koble på en norsk
//  SMS-leverandør (Sveve/Link Mobility) i sendSms nedenfor. Status-sporing
//  (åpnet/signert) oppdateres senere av leverandørens webhook.
// ============================================================================

interface Body {
  customer_id?: string;
  channel?: ContractChannel;
  recipient?: string;
  deal_id?: string;
  document_url?: string;
  message?: string;
}

async function sendSms(to: string, appUrl: string, contractId: string) {
  if (!process.env.SMS_PROVIDER_API_KEY) {
    console.log(`[dry-run] SMS kontrakt til ${to} (id: ${contractId})`);
    return { provider: "dry-run", provider_ref: null as string | null };
  }
  // TODO: integrer SMS-leverandør her.
  console.log(`Sender SMS til ${to} via leverandør (${appUrl}/sign/${contractId})`);
  return { provider: "sms-provider", provider_ref: null as string | null };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  if (!body.customer_id || !body.channel || !body.recipient) {
    return NextResponse.json(
      { error: "customer_id, channel og recipient er påkrevd" },
      { status: 400 },
    );
  }

  // 1) Opprett kontrakt-rad (RLS sikrer at brukeren har tilgang til kunden).
  const { data: contract, error: insErr } = await supabase
    .from("contracts")
    .insert({
      customer_id: body.customer_id,
      deal_id: body.deal_id ?? null,
      agent_id: user.id,
      channel: body.channel,
      recipient: body.recipient,
      status: "draft",
      document_url: body.document_url ?? null,
    })
    .select("*")
    .single();

  if (insErr || !contract) {
    return NextResponse.json(
      { error: insErr?.message ?? "Kunne ikke opprette kontrakt" },
      { status: 500 },
    );
  }

  // Kontekst til en pen e-post (kundenavn + selgernavn + selskaps-branding).
  const [{ data: customer }, { data: sender }, { data: org }] = await Promise.all([
    supabase.from("customers").select("name").eq("id", body.customer_id).single(),
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase
      .from("organization")
      .select("name, logo_url, contract_footer")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  const brandName = (org as { name: string | null } | null)?.name?.trim() || undefined;

  // 2) Send via valgt kanal.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const signUrl = body.document_url ?? `${appUrl}/sign/${contract.id}`;

  const result =
    body.channel === "email"
      ? await sendEmail({
          to: body.recipient,
          subject: `Tilbud fra ${brandName ?? "Salgssentral"}${customer?.name ? " – " + customer.name : ""}`,
          html: contractEmailHtml({
            customerName: customer?.name ?? "der",
            signUrl,
            senderName: sender?.full_name || undefined,
            bodyText: body.message,
            orgName: brandName,
            logoUrl:
              (org as { logo_url: string | null } | null)?.logo_url || undefined,
            footer:
              (org as { contract_footer: string | null } | null)?.contract_footer ||
              undefined,
          }),
          text: `Hei ${customer?.name ?? "der"},\n\n${
            body.message?.trim() ||
            "Vi har sendt deg et tilbud/kontrakt."
          }\n\nÅpne og signer her: ${signUrl}`,
        })
      : await sendSms(body.recipient, appUrl, contract.id);

  // Hvis e-postleverandøren feilet, la kontrakten stå som kladd og meld fra.
  if ("error" in result && result.error) {
    return NextResponse.json(
      { error: "Kunne ikke sende e-post: " + result.error, contract },
      { status: 502 },
    );
  }

  // 3) Marker som sendt.
  const { data: updated } = await supabase
    .from("contracts")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      provider: result.provider,
      provider_ref: result.provider_ref,
    })
    .eq("id", contract.id)
    .select("*")
    .single();

  return NextResponse.json({ ok: true, contract: updated ?? contract });
}

// ─────────────────────────────────────────────────────────────
//  Fremtidig: leverandør-webhook for åpnet/signert-status.
//  Opprett f.eks. /api/contracts/status som mottar callbacks fra
//  e-signaturløsningen og oppdaterer contracts.status til 'opened'/'signed'
//  med tilhørende tidsstempel. Datamodellen støtter allerede dette.
// ─────────────────────────────────────────────────────────────
