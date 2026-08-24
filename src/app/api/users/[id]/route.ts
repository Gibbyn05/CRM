import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

type MemberAction = "set-active" | "set-role" | "remove";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const limited = await enforceRateLimit(req, {
    name: "users:manage-member", limit: 20, windowSeconds: 60,
    ipLimit: 60, ipWindowSeconds: 300,
  });
  if (limited) return limited;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Du må være logget inn." }, { status: 401 });
  if (params.id === user.id) {
    return NextResponse.json({ error: "Du kan ikke endre eller fjerne din egen konto her." }, { status: 400 });
  }

  const body = await req.json().catch(() => null) as {
    action?: MemberAction;
    is_active?: boolean;
    role?: UserRole;
  } | null;
  if (!body?.action || !["set-active", "set-role", "remove"].includes(body.action)) {
    return NextResponse.json({ error: "Ugyldig medlemshandling." }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: actor }, { data: target }] = await Promise.all([
    admin.from("profiles").select("id, role, is_active").eq("id", user.id).maybeSingle(),
    admin.from("profiles").select("id, role, is_active, is_system_admin").eq("id", params.id).maybeSingle(),
  ]);
  if (actor?.role !== "manager" || actor.is_active === false) {
    return NextResponse.json({ error: "Kun aktive ledere kan administrere teamet." }, { status: 403 });
  }
  if (!target) return NextResponse.json({ error: "Brukeren ble ikke funnet." }, { status: 404 });
  if (target.is_system_admin) {
    return NextResponse.json({
      error: "Denne systemadministratorkontoen er låst og kan ikke endres, deaktiveres eller fjernes.",
    }, { status: 403 });
  }

  const wouldRemoveActiveManager = target.role === "manager" && target.is_active && (
    body.action === "remove" ||
    (body.action === "set-active" && body.is_active === false) ||
    (body.action === "set-role" && body.role === "agent")
  );
  if (wouldRemoveActiveManager) {
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "manager")
      .eq("is_active", true);
    if (error) return NextResponse.json({ error: "Kunne ikke kontrollere ledertilganger." }, { status: 500 });
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Minst én aktiv leder må beholdes." }, { status: 400 });
    }
  }

  if (body.action === "set-role") {
    if (body.role !== "agent" && body.role !== "manager") {
      return NextResponse.json({ error: "Ugyldig rolle." }, { status: 400 });
    }
    const { data, error } = await admin
      .from("profiles")
      .update({ role: body.role })
      .eq("id", target.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "Kunne ikke oppdatere rollen." }, { status: 500 });
    const { error: authError } = await admin.auth.admin.updateUserById(target.id, {
      app_metadata: { role: body.role },
    });
    if (authError) return NextResponse.json({ error: "Rollen ble oppdatert, men Auth-data kunne ikke synkroniseres." }, { status: 500 });
    return NextResponse.json({ profile: data });
  }

  if (body.action === "set-active") {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "Aktivstatus mangler." }, { status: 400 });
    }
    const { data, error } = await admin
      .from("profiles")
      .update({ is_active: body.is_active })
      .eq("id", target.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "Kunne ikke oppdatere brukerstatusen." }, { status: 500 });

    const { error: authError } = await admin.auth.admin.updateUserById(target.id, {
      ban_duration: body.is_active ? "none" : "876000h",
    });
    if (authError) {
      await admin.from("profiles").update({ is_active: target.is_active }).eq("id", target.id);
      return NextResponse.json({ error: "Kunne ikke oppdatere innloggingsstatusen." }, { status: 500 });
    }
    return NextResponse.json({ profile: data });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(target.id);
  if (deleteError) {
    return NextResponse.json({
      error: "Brukeren kunne ikke fjernes. Hvis brukeren eier filer, må de først flyttes eller slettes.",
    }, { status: 409 });
  }
  return NextResponse.json({ removedId: target.id });
}
