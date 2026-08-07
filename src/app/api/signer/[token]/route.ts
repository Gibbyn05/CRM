import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";

// ============================================================================
//  POST /api/signer/<token>   body: { name }
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
  try {
    const body = (await req.json()) as { name?: string };
    name = body.name ?? "";
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }
  name = name.trim();
  if (name.length < 2) {
    return NextResponse.json(
      { error: "Skriv inn fullt navn for å signere." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: contract } = await admin
    .from("contracts")
    .select("id, status, signed_at, signer_name, opened_at")
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
      signed_at: contract.signed_at,
    });
  }

  const now = new Date().toISOString();
  const patch: Record<string, string | null> = {
    status: "signed",
    signed_at: now,
    signer_name: name,
    signer_ip: clientIp(req),
  };
  if (!contract.opened_at) patch.opened_at = now;

  const { error: updErr } = await admin
    .from("contracts")
    .update(patch)
    .eq("id", contract.id)
    .neq("status", "signed");
  if (updErr) {
    return NextResponse.json(
      { error: "Kunne ikke registrere signeringen. Prøv igjen." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, signer_name: name, signed_at: now });
}
