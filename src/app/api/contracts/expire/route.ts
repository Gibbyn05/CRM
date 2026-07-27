import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
//  Markerer utløpte signeringslenker. Ment å kalles periodisk av en ekstern
//  scheduler (Vercel Cron / Supabase pg_cron o.l.) – se README for
//  eksempel-oppsett. Autentiseres med delt hemmelighet i
//  X-Cron-Secret-headeren (samme mønster som telefoni-webhooken).
//
//  Idempotent: velger kun kontrakter som faktisk er utløpt OG ikke allerede
//  markert (expired_at is null). Å kjøre denne flere ganger på rad – eller
//  samtidig fra to schedulere – har ingen ytterligere effekt.
// ============================================================================

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CONTRACTS_CRON_SECRET) {
    return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: expiring, error: selErr } = await supabase
    .from("contracts")
    .select("id")
    .in("status", ["sent", "opened"])
    .is("expired_at", null)
    .lt("token_expires_at", nowIso);

  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  const ids = (expiring ?? []).map((c: { id: string }) => c.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, expired: 0 });
  }

  const { error: updErr } = await supabase
    .from("contracts")
    .update({ expired_at: nowIso })
    .in("id", ids);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await supabase.from("contract_events").insert(
    ids.map((id: string) => ({ contract_id: id, event_type: "expired", actor: "system" })),
  );

  return NextResponse.json({ ok: true, expired: ids.length });
}

// Enkel helsesjekk.
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "contracts expire",
    note: "POST med X-Cron-Secret-header for å kjøre.",
  });
}
