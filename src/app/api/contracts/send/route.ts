import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ContractChannel, DealItem } from "@/lib/types";
import { sendEmail, contractEmailHtml } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { generateSigningToken } from "@/lib/tokens";
import { calculateTotal } from "@/lib/templates";

// ============================================================================
//  Send tilbud/kontrakt via e-post eller SMS fra kundekortet, med sikker,
//  unik signeringslenke (/sign/[token]).
//
//  Selve gjengivelsen av kontrakt-/e-postmaler (plassholdere -> tekst) skjer
//  KLIENT-side i ContractsPanel (src/lib/templates.ts er en ren, isomorf
//  funksjon) slik at selgeren kan forhåndsvise og redigere manuelt før
//  utsending. Denne routen lagrer/sender akkurat det som faktisk ble
//  forhåndsvist (document_body/email_body/subject), genererer en tilfeldig
//  signeringstoken (se src/lib/tokens.ts) og logger hele hendelsesforløpet i
//  contract_events (revisjonslogg, vist på kundekortet).
//
//  E-post går via Resend når RESEND_API_KEY er satt (se src/lib/email.ts),
//  SMS via den konfigurerte leverandøren i src/lib/sms.ts – begge kjører
//  "dry-run" uten nøkkel. Status-oppdatering ved åpning/signering/avslag
//  skjer i /api/sign/[token] (se der for idempotens/IP-håndtering).
// ============================================================================

interface Body {
  customer_id?: string;
  deal_id?: string;
  channel?: ContractChannel;
  recipient?: string;
  contract_template_id?: string | null;
  email_template_id?: string | null;
  // Emne (kun e-post), samt ferdig gjengitt (og ev. manuelt redigert)
  // kontrakt-/e-postinnhold. document_body er det som vises/signeres på
  // /sign/[token] – uten dette kan ikke kontrakten sendes.
  subject?: string;
  document_body?: string;
  email_body?: string;
  sms_message?: string;
}

const SIGNING_LINK_TTL_DAYS = Number(process.env.SIGNING_LINK_TTL_DAYS ?? 14) || 14;

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
  if (!body.document_body?.trim()) {
    return NextResponse.json(
      { error: "Kontraktinnhold (det kunden skal signere) er påkrevd." },
      { status: 400 },
    );
  }
  if (body.channel === "email" && !body.subject?.trim()) {
    return NextResponse.json({ error: "Emnefelt er påkrevd for e-post." }, { status: 400 });
  }

  // Kontekst: kundens org.nr (snapshot), selgers navn (rådgiver), og ev.
  // tilbudslinjer for totalbeløp.
  const [{ data: customer }, { data: sender }, { data: itemsRes }] = await Promise.all([
    supabase.from("customers").select("name, org_number").eq("id", body.customer_id).single(),
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    body.deal_id
      ? supabase.from("deal_items").select("*").eq("deal_id", body.deal_id)
      : Promise.resolve({ data: null }),
  ]);
  const items = (itemsRes as DealItem[] | null) ?? [];

  const token = generateSigningToken();
  const tokenExpiresAt = new Date(
    Date.now() + SIGNING_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

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
      contract_template_id: body.contract_template_id ?? null,
      email_template_id: body.channel === "email" ? body.email_template_id ?? null : null,
      subject: body.channel === "email" ? body.subject!.trim() : null,
      document_body: body.document_body,
      email_body: body.channel === "email" ? body.email_body ?? null : null,
      org_number: customer?.org_number ?? null,
      advisor_name: sender?.full_name || null,
      total_amount: items.length ? calculateTotal(items) : null,
      signing_token: token,
      token_expires_at: tokenExpiresAt,
    })
    .select("*")
    .single();

  if (insErr || !contract) {
    return NextResponse.json(
      { error: insErr?.message ?? "Kunne ikke opprette kontrakt" },
      { status: 500 },
    );
  }

  await supabase
    .from("contract_events")
    .insert({ contract_id: contract.id, event_type: "created", actor: "agent" });

  // 2) Send via valgt kanal.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const signUrl = `${appUrl}/sign/${token}`;

  const result =
    body.channel === "email"
      ? await sendEmail({
          to: body.recipient,
          subject: body.subject!.trim(),
          html: contractEmailHtml({
            customerName: customer?.name ?? "der",
            signUrl,
            senderName: sender?.full_name || undefined,
            bodyText: body.email_body,
          }),
          text: `Hei ${customer?.name ?? "der"},\n\n${
            body.email_body?.trim() || "Vi har sendt deg et tilbud/kontrakt."
          }\n\nÅpne og signer her: ${signUrl}`,
        })
      : await sendSms({
          to: body.recipient,
          message:
            body.sms_message?.trim() ||
            `Hei! ${sender?.full_name ? sender.full_name + " har" : "Du har"} sendt deg et tilbud. Åpne og signer: ${signUrl}`,
        });

  // Hvis leverandøren feilet, la kontrakten stå som kladd og meld fra.
  if ("error" in result && result.error) {
    return NextResponse.json(
      { error: "Kunne ikke sende: " + result.error, contract },
      { status: 502 },
    );
  }

  // 3) Marker som sendt + logg hendelsen.
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

  await supabase.from("contract_events").insert({
    contract_id: contract.id,
    event_type: "sent",
    actor: "agent",
    metadata: { channel: body.channel, provider: result.provider },
  });

  return NextResponse.json({ ok: true, contract: updated ?? contract });
}
