import { createHash, randomBytes } from "node:crypto";
import type { UserRole } from "@/lib/types";

export const INVITATION_TTL_HOURS = 72;
export const PENDING_PROFILE_NAME = "Venter på profil";

export function createInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationExpiresAt(from = new Date()) {
  return new Date(from.getTime() + INVITATION_TTL_HOURS * 60 * 60 * 1000);
}

export function isInvitationExpired(expiresAt: string, now = new Date()) {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export function normalizeInviteInput(input: {
  full_name?: unknown;
  email?: unknown;
  role?: unknown;
}): { fullName: string; email: string; role: UserRole } {
  const requestedName = typeof input.full_name === "string" ? input.full_name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const role: UserRole = input.role === "manager" ? "manager" : "agent";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Ugyldig e-postadresse.");
  }
  // Lederen velger rolle og e-post. Den inviterte setter sitt eget navn når
  // kontoen aktiveres, mens feltet beholdes som obligatorisk i databasen.
  return { fullName: requestedName || PENDING_PROFILE_NAME, email, role };
}

export function invitationEmail(input: {
  fullName: string;
  inviterName: string;
  role: UserRole;
  acceptUrl: string;
}) {
  const roleLabel = input.role === "manager" ? "leder" : "selger";
  const safeInviter = escapeHtml(input.inviterName);
  const safeUrl = escapeHtml(input.acceptUrl);
  const hasName = input.fullName !== PENDING_PROFILE_NAME;
  return {
    subject: "Du er invitert til Media Norge CRM",
    text: `${hasName ? `Hei ${input.fullName}.` : "Hei."} ${input.inviterName} har invitert deg til Media Norge CRM som ${roleLabel}. Du velger selv navn, profilbilde og passord når du aktiverer kontoen innen 72 timer: ${input.acceptUrl}`,
    html: `<!doctype html><html lang="no"><body style="margin:0;background:#f5efe2;font-family:Arial,sans-serif;color:#211b16"><div style="max-width:560px;margin:40px auto;background:#fffaf0;border:1px solid #e4d6bd;border-radius:20px;overflow:hidden"><div style="background:#151515;color:#fff;padding:28px 32px"><div style="font-size:24px;font-weight:800">Media Norge CRM</div></div><div style="padding:32px"><h1 style="font-size:25px;margin:0 0 16px">Velkommen</h1><p style="font-size:16px;line-height:1.6">${safeInviter} har invitert deg til Media Norge CRM som <strong>${roleLabel}</strong>.</p><p style="font-size:16px;line-height:1.6">Du velger selv navn, profilbilde og passord når du aktiverer kontoen. Lenken er gyldig i 72 timer og kan bare brukes én gang.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#078b5b;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">Aktiver konto</a></p><p style="font-size:13px;color:#766b5e;line-height:1.5">Hvis du ikke forventet denne invitasjonen, kan du ignorere e-posten.</p></div></div></body></html>`,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
