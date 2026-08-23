import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { createInvitationToken, invitationEmail, invitationExpiresAt } from "@/lib/user-invitations";
import { getPublicAppUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  const limited = await enforceRateLimit(req, {
    name: "users:invitation-action", limit: 15, windowSeconds: 60, userId: user.id,
  });
  if (limited) return limited;

  const { data: manager } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();
  if (manager?.role !== "manager") {
    return NextResponse.json({ error: "Kun ledere kan endre invitasjoner." }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as { action?: string } | null;
  if (body?.action !== "resend" && body?.action !== "revoke") {
    return NextResponse.json({ error: "Ugyldig handling." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: invitation } = await admin.from("user_invitations").select("*").eq("id", params.id).single();
  if (!invitation || !["pending", "expired"].includes(invitation.status)) {
    return NextResponse.json({ error: "Invitasjonen kan ikke endres." }, { status: 409 });
  }

  if (body.action === "revoke") {
    const { tokenHash } = createInvitationToken();
    const { data, error } = await admin.from("user_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), token_hash: tokenHash, email_error: null })
      .eq("id", params.id).in("status", ["pending", "expired"])
      .select("id, email, full_name, role, status, expires_at, sent_at, created_at, email_error").single();
    if (error) return NextResponse.json({ error: "Kunne ikke trekke invitasjonen tilbake." }, { status: 500 });
    return NextResponse.json({ invitation: data });
  }

  const { token, tokenHash } = createInvitationToken();
  const expiresAt = invitationExpiresAt();
  const { error: rotateError } = await admin.from("user_invitations").update({
    status: "pending", token_hash: tokenHash, expires_at: expiresAt.toISOString(),
    revoked_at: null, email_error: null,
  }).eq("id", params.id).in("status", ["pending", "expired"]);
  if (rotateError) return NextResponse.json({ error: "Kunne ikke fornye invitasjonen." }, { status: 500 });

  const appUrl = getPublicAppUrl(req.nextUrl.origin);
  const mail = invitationEmail({
    fullName: invitation.full_name,
    inviterName: manager.full_name || "En leder",
    role: invitation.role,
    acceptUrl: `${appUrl}/accept-invite?token=${encodeURIComponent(token)}`,
  });
  const sent = await sendEmail({ to: invitation.email, ...mail });
  const sentAt = sent.error ? null : new Date().toISOString();
  const { data } = await admin.from("user_invitations").update({
    sent_at: sentAt ?? invitation.sent_at,
    last_sent_at: sentAt,
    send_count: sent.error ? invitation.send_count : invitation.send_count + 1,
    email_error: sent.error ?? null,
  }).eq("id", params.id)
    .select("id, email, full_name, role, status, expires_at, sent_at, created_at, email_error").single();
  if (sent.error) {
    return NextResponse.json({ error: "Ny lenke ble opprettet, men e-posten kunne ikke sendes. Prøv igjen.", invitation: data }, { status: 502 });
  }
  return NextResponse.json({ invitation: data });
}
