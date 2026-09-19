import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordOperationsAudit } from "@/lib/email-delivery";

// Dette utfører ikke en gjenoppretting. Det registrerer at en leder faktisk
// har kontrollert gjenopprettingsrutinen i Supabase, slik at CRM-et ikke
// later som om en backup er testet uten menneskelig bekreftelse.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "operations:recovery-check",
    limit: 5,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  const { data: me } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "manager" || me.is_active === false) {
    return NextResponse.json({ error: "Kun aktive ledere kan bekrefte gjenoppretting." }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { confirmed?: boolean; note?: string } | null;
  if (body?.confirmed !== true) {
    return NextResponse.json({ error: "Bekreftelse mangler." }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;
  const admin = createAdminClient();
  const checkedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("recovery_checkpoints")
    .upsert({
      check_type: "backup_restore",
      checked_at: checkedAt,
      checked_by: user.id,
      note,
    }, { onConflict: "check_type" })
    .select("checked_at, checked_by, note")
    .single();
  if (error) return NextResponse.json({ error: "Kunne ikke lagre kontrollen." }, { status: 500 });

  await recordOperationsAudit(admin, {
    actorId: user.id,
    category: "recovery",
    action: "backup_restore_confirmed",
    targetType: "recovery_checkpoint",
    targetId: "backup_restore",
    summary: "Backup- og gjenopprettingsrutinen ble bekreftet kontrollert.",
    metadata: { note },
  });

  return NextResponse.json({ checkpoint: data });
}
