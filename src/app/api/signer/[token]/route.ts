import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendSignedContractCopies } from "@/lib/contract-signing-email";

// ============================================================================
//  POST /api/signer/<token>   body: { name, email, phone }
//
//  OFFENTLIG (ingen innlogging). Kunden signerer avtalen: vi registrerer
//  navn, tidspunkt og IP-adresse og setter contracts.status = «signed».
//  Idempotent – en allerede signert kontrakt kan ikke signeres på nytt.
// ============================================================================

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const limited = await enforceRateLimit(req, {
    name: "signer:sign",
    limit: 15,
    windowSeconds: 60,
  });
  if (limited) return limited;

  let name = "";
  let email = "";
  let phone = "";
  try {
    const body = (await req.json()) as { name?: string; email?: string; phone?: string };
    name = body.name ?? "";
    email = body.email ?? "";
    phone = body.phone ?? "";
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }
  name = name.trim();
  email = email.trim().toLowerCase();
  phone = phone.trim();
  if (name.length < 2) {
    return NextResponse.json(
      { error: "Skriv inn fullt navn for å signere." },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Skriv inn en gyldig e-postadresse." },
      { status: 400 },
    );
  }
  if (phone.replace(/\D/g, "").length < 8) {
    return NextResponse.json(
      { error: "Skriv inn et gyldig telefonnummer." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: contract } = await admin
    .from("contracts")
    .select("id, status, signed_at, signer_name, signer_email, signer_phone, opened_at, agent_id, contract_text, sign_token, customer:customers(name)")
    .eq("sign_token", params.token)
    .maybeSingle();

  if (!contract) {
    return NextResponse.json({ error: "Fant ikke avtalen." }, { status: 404 });
  }
  if (contract.status === "signed") {
    return NextResponse.json({
      ok: true,
      already: true,
      signer_name: contract.signer_name,
      signer_email: contract.signer_email,
      signer_phone: contract.signer_phone,
      signed_at: contract.signed_at,
    });
  }

  const now = new Date().toISOString();
  const patch: Record<string, string | null> = {
    status: "signed",
    signed_at: now,
    signer_name: name,
    signer_email: email,
    signer_phone: phone,
    signer_ip: clientIp(req),
  };
  if (!contract.opened_at) patch.opened_at = now;

  const { data: signedContract, error: updErr } = await admin
    .from("contracts")
    .update(patch)
    .eq("id", contract.id)
    .neq("status", "signed")
    .select("signer_name, signer_email, signer_phone, signed_at")
    .maybeSingle();
  if (updErr || !signedContract) {
    return NextResponse.json(
      { error: "Kunne ikke registrere signeringen. Prøv igjen." },
      { status: 500 },
    );
  }

  const customer = (Array.isArray(contract.customer)
    ? contract.customer[0]
    : contract.customer) as { name: string | null } | null;

  await sendSignedContractCopies(admin, {
    id: contract.id,
    agent_id: contract.agent_id,
    contract_text: contract.contract_text,
    sign_token: contract.sign_token,
    signer_name: signedContract.signer_name,
    signer_email: signedContract.signer_email,
    signer_phone: signedContract.signer_phone,
    signed_at: signedContract.signed_at,
    customer_name: customer?.name?.trim() || "kunde",
  });

  return NextResponse.json({
    ok: true,
    signer_name: signedContract.signer_name,
    signer_email: signedContract.signer_email,
    signer_phone: signedContract.signer_phone,
    signed_at: signedContract.signed_at,
  });
}
