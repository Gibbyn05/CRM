import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { hashInvitationToken, isInvitationExpired } from "@/lib/user-invitations";

export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = "id, auth_user_id, email, full_name, role, status, expires_at, token_hash";
const invalidMessage = "Invitasjonslenken er ugyldig, brukt eller tilbakekalt. Kontakt lederen din for en ny invitasjon.";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, {
    name: "auth:accept-invitation", limit: 10, windowSeconds: 60,
    ipLimit: 20, ipWindowSeconds: 300,
  });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    action?: "inspect" | "accept";
    token?: string;
    password?: string;
  } | null;
  if (!body?.token || body.token.length > 256 || !["inspect", "accept"].includes(body.action ?? "")) {
    return NextResponse.json({ error: invalidMessage }, { status: 400 });
  }

  const admin = createAdminClient();
  const tokenHash = hashInvitationToken(body.token);
  const { data: invitation } = await admin
    .from("user_invitations").select(PUBLIC_FIELDS).eq("token_hash", tokenHash).maybeSingle();

  if (!invitation) return NextResponse.json({ error: invalidMessage }, { status: 404 });
  if (invitation.status === "accepted") {
    if (body.action === "accept") {
      return NextResponse.json({ ok: true, alreadyAccepted: true, email: invitation.email });
    }
    return NextResponse.json({ error: "Denne invitasjonen er allerede brukt. Logg inn, eller kontakt lederen din." }, { status: 410 });
  }
  if (invitation.status === "revoked") {
    return NextResponse.json({ error: invalidMessage }, { status: 410 });
  }
  if (invitation.status === "expired" || isInvitationExpired(invitation.expires_at)) {
    if (invitation.status === "pending") {
      await admin.from("user_invitations").update({ status: "expired" }).eq("id", invitation.id).eq("status", "pending");
    }
    return NextResponse.json({ error: "Invitasjonen har utløpt. Kontakt lederen din for å få en ny lenke." }, { status: 410 });
  }
  if (invitation.status !== "pending") {
    return NextResponse.json({ error: invalidMessage }, { status: 410 });
  }

  if (body.action === "inspect") {
    return NextResponse.json({
      full_name: invitation.full_name,
      email: invitation.email,
      role: invitation.role,
      expires_at: invitation.expires_at,
    });
  }

  const password = body.password ?? "";
  if (password.length < 8) {
    return NextResponse.json({ error: "Passordet må være minst åtte tegn." }, { status: 400 });
  }

  if (invitation.auth_user_id) {
    const { data: knownUser } = await admin.auth.admin.getUserById(invitation.auth_user_id);
    if (!knownUser.user || knownUser.user.email?.toLowerCase() !== invitation.email) {
      return NextResponse.json({ error: "Invitasjonen kunne ikke aktiveres. Kontakt lederen din." }, { status: 409 });
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(invitation.auth_user_id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: invitation.full_name },
      app_metadata: { role: invitation.role },
    });
    if (updateError) {
      return NextResponse.json({ error: "Kontoen kunne ikke ferdigstilles. Prøv igjen." }, { status: 500 });
    }
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: invitation.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: invitation.full_name },
      app_metadata: { role: invitation.role },
    });
    if (createError || !created.user) {
      const duplicate = /already been registered|already exists/i.test(createError?.message ?? "");
      return NextResponse.json(
        { error: duplicate ? "Kontoen aktiveres allerede. Vent et øyeblikk og prøv å logge inn." : "Kunne ikke opprette kontoen. Prøv igjen." },
        { status: duplicate ? 409 : 500 },
      );
    }
    invitation.auth_user_id = created.user.id;
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: invitation.auth_user_id,
    email: invitation.email,
    full_name: invitation.full_name,
    role: invitation.role,
    is_active: true,
  }, { onConflict: "id" });
  if (profileError) {
    return NextResponse.json({ error: "Kontoen ble opprettet, men profilen kunne ikke ferdigstilles. Prøv igjen." }, { status: 500 });
  }

  const { data: accepted, error: acceptError } = await admin.from("user_invitations").update({
    auth_user_id: invitation.auth_user_id,
    status: "accepted",
    accepted_at: new Date().toISOString(),
    email_error: null,
  }).eq("id", invitation.id).eq("status", "pending").select("id").maybeSingle();

  if (acceptError) {
    return NextResponse.json({ error: "Kontoen er aktivert. Gå til innlogging for å fortsette." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, alreadyAccepted: !accepted, email: invitation.email });
}
