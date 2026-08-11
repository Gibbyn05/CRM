import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import {
  createInvitationToken,
  invitationEmail,
  invitationExpiresAt,
  normalizeInviteInput,
} from "@/lib/user-invitations";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "users:invite", limit: 10, windowSeconds: 60, userId: user.id,
  });
  if (limited) return limited;

  const { data: manager } = await supabase
    .from("profiles").select("full_name, role").eq("id", user.id).single();
  if (manager?.role !== "manager") {
    return NextResponse.json({ error: "Kun ledere kan invitere brukere." }, { status: 403 });
  }

  let input: ReturnType<typeof normalizeInviteInput>;
  try {
    input = normalizeInviteInput(await req.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ugyldig forespørsel." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const [{ data: existingProfile }, { data: invitations }, authUsers] = await Promise.all([
    admin.from("profiles").select("id").ilike("email", input.email).limit(1).maybeSingle(),
    admin.from("user_invitations").select("id, status, expires_at").ilike("email", input.email).eq("status", "pending"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (existingProfile || authUsers.data.users.some((authUser) => authUser.email?.toLowerCase() === input.email)) {
    return NextResponse.json({ error: "En aktiv bruker med denne e-posten finnes allerede." }, { status: 409 });
  }

  const now = new Date();
  const validInvite = invitations?.find((invite) => new Date(invite.expires_at) > now);
  if (validInvite) {
    return NextResponse.json({ error: "Det finnes allerede en gyldig invitasjon til denne e-posten." }, { status: 409 });
  }
  if (invitations?.length) {
    await admin.from("user_invitations").update({ status: "expired" }).in("id", invitations.map((invite) => invite.id));
  }

  const { token, tokenHash } = createInvitationToken();
  const expiresAt = invitationExpiresAt();
  const { data: invitation, error: insertError } = await admin
    .from("user_invitations")
    .insert({
      email: input.email,
      full_name: input.fullName,
      role: input.role,
      token_hash: tokenHash,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, email, full_name, role, status, expires_at, sent_at, created_at, email_error")
    .single();
  if (insertError || !invitation) {
    return NextResponse.json({ error: "Kunne ikke opprette invitasjonen." }, { status: 500 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
  const mail = invitationEmail({
    fullName: input.fullName,
    inviterName: manager.full_name || "En leder",
    role: input.role,
    acceptUrl: `${appUrl}/accept-invite?token=${encodeURIComponent(token)}`,
  });
  const sent = await sendEmail({ to: input.email, ...mail });
  const sentAt = sent.error ? null : new Date().toISOString();
  const { data: updated } = await admin
    .from("user_invitations")
    .update({
      sent_at: sentAt,
      last_sent_at: sentAt,
      send_count: sent.error ? 0 : 1,
      email_error: sent.error ?? null,
    })
    .eq("id", invitation.id)
    .select("id, email, full_name, role, status, expires_at, sent_at, created_at, email_error")
    .single();

  if (sent.error) {
    return NextResponse.json(
      { error: "Invitasjonen ble lagret, men e-posten kunne ikke sendes. Prøv Send på nytt.", invitation: updated ?? invitation },
      { status: 502 },
    );
  }
  return NextResponse.json({ invitation: updated ?? invitation }, { status: 201 });
}
