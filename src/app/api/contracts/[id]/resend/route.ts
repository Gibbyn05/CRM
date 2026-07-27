import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, contractEmailHtml } from "@/lib/email";
import { sendSms } from "@/lib/sms";

// ============================================================================
//  Send samme signeringslenke på nytt (påminnelse). Forlenger
//  token_expires_at, nullstiller ev. expired_at, og øker resend_count.
//  Logges som en egen 'resent'-hendelse i revisjonsloggen.
// ============================================================================

const SIGNING_LINK_TTL_DAYS = Number(process.env.SIGNING_LINK_TTL_DAYS ?? 14) || 14;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!contract) return NextResponse.json({ error: "Fant ikke kontrakten." }, { status: 404 });
  if (contract.status === "signed" || contract.status === "declined") {
    return NextResponse.json(
      { error: "Kontrakten er allerede signert/avslått og kan ikke sendes på nytt." },
      { status: 409 },
    );
  }
  if (!contract.signing_token) {
    return NextResponse.json(
      { error: "Kontrakten mangler en signeringslenke å sende på nytt." },
      { status: 400 },
    );
  }

  const [{ data: customer }, { data: sender }] = await Promise.all([
    supabase.from("customers").select("name").eq("id", contract.customer_id).single(),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", contract.agent_id ?? user.id)
      .single(),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const signUrl = `${appUrl}/sign/${contract.signing_token}`;

  const result =
    contract.channel === "email"
      ? await sendEmail({
          to: contract.recipient,
          subject:
            contract.subject ||
            `Tilbud fra Salgssentral${customer?.name ? " – " + customer.name : ""}`,
          html: contractEmailHtml({
            customerName: customer?.name ?? "der",
            signUrl,
            senderName: sender?.full_name || undefined,
            bodyText: contract.email_body || undefined,
          }),
          text: `Hei ${customer?.name ?? "der"},\n\nPåminnelse: du har et tilbud til gjennomgang.\n\nÅpne og signer her: ${signUrl}`,
        })
      : await sendSms({
          to: contract.recipient,
          message: `Påminnelse: du har et tilbud til signering. Åpne og signer: ${signUrl}`,
        });

  if ("error" in result && result.error) {
    return NextResponse.json({ error: "Kunne ikke sende på nytt: " + result.error }, { status: 502 });
  }

  const tokenExpiresAt = new Date(
    Date.now() + SIGNING_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: updated } = await supabase
    .from("contracts")
    .update({
      status: contract.status === "draft" ? "sent" : contract.status,
      sent_at: new Date().toISOString(),
      token_expires_at: tokenExpiresAt,
      expired_at: null,
      resend_count: (contract.resend_count ?? 0) + 1,
    })
    .eq("id", contract.id)
    .select("*")
    .single();

  await supabase.from("contract_events").insert({
    contract_id: contract.id,
    event_type: "resent",
    actor: "agent",
    metadata: { channel: contract.channel },
  });

  return NextResponse.json({ ok: true, contract: updated ?? contract });
}
