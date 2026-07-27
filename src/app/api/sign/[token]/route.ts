import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contract } from "@/lib/types";
import { getClientIp } from "@/lib/request";
import { sendEmail, signedCopyEmailHtml } from "@/lib/email";
import { formatDateTime } from "@/lib/format";

// ============================================================================
//  Offentlig, token-gatet signeringsflyt. Ingen innlogging – lenken (den
//  lange, tilfeldige signing_token) ER autentiseringen, akkurat som andre
//  kapabilitets-lenker (f.eks. "avmeld nyhetsbrev"). Bruker service-role
//  (bypasser RLS med vilje – kunden har ingen Supabase-sesjon).
//
//  GET  – henter dokumentet og markerer det som åpnet (kun første gang).
//  POST – {action:'sign'|'decline', ...} signerer/avslår.
//
//  Idempotent: gjentatte GET/POST med samme handling endrer ikke tilstanden
//  på nytt eller sender duplikate e-poster/hendelser – nødvendig siden
//  kunden kan laste siden på nytt, dobbeltklikke, eller nettverket kan
//  retry'e. All handling logges i contract_events (revisjonslogg vist på
//  kundekortet). Se README for GDPR-notat om IP-lagring.
// ============================================================================

async function loadContract(
  supabase: SupabaseClient,
  token: string,
): Promise<Contract | null> {
  const { data } = await supabase
    .from("contracts")
    .select("*")
    .eq("signing_token", token)
    .single();
  return (data as Contract | null) ?? null;
}

function isExpired(contract: Contract): boolean {
  if (contract.status === "signed" || contract.status === "declined") return false;
  if (contract.expired_at) return true;
  if (!contract.token_expires_at) return false;
  return new Date(contract.token_expires_at) < new Date();
}

// Lat utløps-markering: selv uten en ekstern cron (se /api/contracts/expire)
// vil et besøk på en utløpt lenke markere den korrekt der og da.
async function markExpiredIfNeeded(
  supabase: SupabaseClient,
  contract: Contract,
): Promise<Contract> {
  if (
    !contract.expired_at &&
    contract.token_expires_at &&
    new Date(contract.token_expires_at) < new Date() &&
    contract.status !== "signed" &&
    contract.status !== "declined"
  ) {
    const nowIso = new Date().toISOString();
    await supabase.from("contracts").update({ expired_at: nowIso }).eq("id", contract.id);
    await supabase
      .from("contract_events")
      .insert({ contract_id: contract.id, event_type: "expired", actor: "system" });
    return { ...contract, expired_at: nowIso };
  }
  return contract;
}

function publicView(contract: Contract, customerName: string) {
  return {
    customer_name: customerName,
    status: contract.status,
    expired: isExpired(contract),
    channel: contract.channel,
    subject: contract.subject,
    document_body: contract.document_body,
    org_number: contract.org_number,
    advisor_name: contract.advisor_name,
    total_amount: contract.total_amount,
    sent_at: contract.sent_at,
    opened_at: contract.opened_at,
    signed_at: contract.signed_at,
    signed_by_name: contract.signed_by_name,
    declined_at: contract.declined_at,
    declined_reason: contract.declined_reason,
    token_expires_at: contract.token_expires_at,
  };
}

async function sendSignedCopies(
  supabase: SupabaseClient,
  contract: Contract,
  customerName: string,
) {
  const recipients = new Set<string>();
  if (contract.channel === "email") recipients.add(contract.recipient);
  if (contract.signed_by_email) recipients.add(contract.signed_by_email);
  if (contract.agent_id) {
    const { data: agent } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", contract.agent_id)
      .single();
    if (agent?.email) recipients.add(agent.email);
  }
  if (recipients.size === 0 || !contract.document_body) return;

  const html = signedCopyEmailHtml({
    customerName,
    documentBody: contract.document_body,
    signedByName: contract.signed_by_name ?? "kunden",
    signedAt: formatDateTime(contract.signed_at),
  });
  await Promise.all(
    [...recipients].map((to) =>
      sendEmail({ to, subject: `Signert: ${contract.subject || "Kontrakt"}`, html }),
    ),
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const supabase = createAdminClient();
  let contract = await loadContract(supabase, params.token);
  if (!contract) {
    return NextResponse.json({ error: "Lenken er ugyldig eller finnes ikke." }, { status: 404 });
  }
  contract = await markExpiredIfNeeded(supabase, contract);

  const { data: customer } = await supabase
    .from("customers")
    .select("name")
    .eq("id", contract.customer_id)
    .single();
  const customerName = customer?.name ?? "";

  // Marker som åpnet – kun ved første besøk (idempotent: gjentatte besøk gir
  // verken ny hendelse eller endret opened_at/opened_ip).
  if (!isExpired(contract) && (contract.status === "draft" || contract.status === "sent")) {
    const ip = getClientIp(req);
    const nowIso = new Date().toISOString();
    const { data: updated } = await supabase
      .from("contracts")
      .update({ status: "opened", opened_at: nowIso, opened_ip: ip })
      .eq("id", contract.id)
      .select("*")
      .single();
    if (updated) contract = updated as Contract;
    await supabase.from("contract_events").insert({
      contract_id: contract.id,
      event_type: "opened",
      actor: "customer",
      ip,
      user_agent: req.headers.get("user-agent"),
    });
  }

  return NextResponse.json(publicView(contract, customerName));
}

interface SignBody {
  action?: "sign" | "decline";
  name?: string;
  email?: string;
  reason?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const supabase = createAdminClient();
  let contract = await loadContract(supabase, params.token);
  if (!contract) {
    return NextResponse.json({ error: "Lenken er ugyldig eller finnes ikke." }, { status: 404 });
  }
  contract = await markExpiredIfNeeded(supabase, contract);

  const { data: customer } = await supabase
    .from("customers")
    .select("name")
    .eq("id", contract.customer_id)
    .single();
  const customerName = customer?.name ?? "";

  let body: SignBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  if (isExpired(contract)) {
    return NextResponse.json(
      { error: "Signeringslenken er utløpt. Be selgeren sende den på nytt.", ...publicView(contract, customerName) },
      { status: 410 },
    );
  }

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  if (body.action === "decline") {
    // Idempotent: allerede avslått -> returner nåværende tilstand uten
    // å logge en ny hendelse.
    if (contract.status === "declined") {
      return NextResponse.json(publicView(contract, customerName));
    }
    if (contract.status === "signed") {
      return NextResponse.json(
        { error: "Kontrakten er allerede signert og kan ikke avslås." },
        { status: 409 },
      );
    }
    const nowIso = new Date().toISOString();
    const { data: updated } = await supabase
      .from("contracts")
      .update({
        status: "declined",
        declined_at: nowIso,
        declined_reason: body.reason?.trim() || null,
      })
      .eq("id", contract.id)
      .select("*")
      .single();
    contract = (updated as Contract) ?? contract;
    await supabase.from("contract_events").insert({
      contract_id: contract.id,
      event_type: "declined",
      actor: "customer",
      ip,
      user_agent: userAgent,
      metadata: body.reason?.trim() ? { reason: body.reason.trim() } : {},
    });
    return NextResponse.json(publicView(contract, customerName));
  }

  if (body.action === "sign") {
    // Idempotent: allerede signert -> returner nåværende tilstand uten å
    // sende signert kopi på nytt.
    if (contract.status === "signed") {
      return NextResponse.json(publicView(contract, customerName));
    }
    if (contract.status === "declined") {
      return NextResponse.json(
        { error: "Kontrakten er allerede avslått og kan ikke signeres." },
        { status: 409 },
      );
    }
    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Fullt navn er påkrevd for å signere." },
        { status: 400 },
      );
    }
    const nowIso = new Date().toISOString();
    const signedByEmail =
      body.email?.trim() || (contract.channel === "email" ? contract.recipient : null);
    const { data: updated } = await supabase
      .from("contracts")
      .update({
        status: "signed",
        signed_at: nowIso,
        signed_ip: ip,
        signed_by_name: body.name.trim(),
        signed_by_email: signedByEmail,
      })
      .eq("id", contract.id)
      .select("*")
      .single();
    contract = (updated as Contract) ?? contract;
    await supabase.from("contract_events").insert({
      contract_id: contract.id,
      event_type: "signed",
      actor: "customer",
      ip,
      user_agent: userAgent,
      metadata: { signed_by_name: body.name.trim() },
    });

    // Send signert kopi til begge parter (feiler ikke selve signeringen om
    // e-post skulle svikte – signaturen er allerede lagret).
    try {
      await sendSignedCopies(supabase, contract, customerName);
    } catch (e) {
      console.error("Kunne ikke sende signert kopi:", e);
    }

    return NextResponse.json(publicView(contract, customerName));
  }

  return NextResponse.json(
    { error: "Ugyldig handling. Forventet 'sign' eller 'decline'." },
    { status: 400 },
  );
}
