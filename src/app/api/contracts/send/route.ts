import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ContractChannel } from "@/lib/types";

// ============================================================================
//  Send kontrakt via e-post eller SMS fra kundekortet.
//
//  Utsendelsen er stubbet: hvis EMAIL_PROVIDER_API_KEY / SMS_PROVIDER_API_KEY
//  ikke er satt, kjøres en "dry-run" som logger og markerer kontrakten som
//  sendt. Koble på en faktisk leverandør (Resend/Postmark/Twilio/Sveve) i
//  sendEmail/sendSms nedenfor. Status-sporing (åpnet/signert) oppdateres
//  senere av leverandørens webhook (se kommentar nederst).
// ============================================================================

interface Body {
  customer_id?: string;
  channel?: ContractChannel;
  recipient?: string;
  deal_id?: string;
  document_url?: string;
}

async function sendEmail(to: string, appUrl: string, contractId: string) {
  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    console.log(`[dry-run] E-post kontrakt til ${to} (id: ${contractId})`);
    return { provider: "dry-run", provider_ref: null as string | null };
  }
  // TODO: integrer e-postleverandør her. Lenke til signering:
  // `${appUrl}/sign/${contractId}`
  console.log(`Sender e-post til ${to} via leverandør (${appUrl}/sign/${contractId})`);
  return { provider: "email-provider", provider_ref: null as string | null };
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

  // 2) Send via valgt kanal.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const result =
    body.channel === "email"
      ? await sendEmail(body.recipient, appUrl, contract.id)
      : await sendSms(body.recipient, appUrl, contract.id);

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
