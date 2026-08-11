import { describe, expect, it } from "vitest";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  isInvitationExpired,
  normalizeInviteInput,
} from "./user-invitations";

describe("user invitations", () => {
  it("stores a deterministic SHA-256 hash rather than the token", () => {
    const { token, tokenHash } = createInvitationToken();
    expect(token).not.toBe(tokenHash);
    expect(tokenHash).toHaveLength(64);
    expect(hashInvitationToken(token)).toBe(tokenHash);
  });

  it("expires after 72 hours", () => {
    const start = new Date("2026-08-11T10:00:00Z");
    const expiry = invitationExpiresAt(start);
    expect(expiry.toISOString()).toBe("2026-08-14T10:00:00.000Z");
    expect(isInvitationExpired(expiry.toISOString(), new Date("2026-08-14T09:59:59Z"))).toBe(false);
    expect(isInvitationExpired(expiry.toISOString(), expiry)).toBe(true);
  });

  it("normalizes email and only accepts supported roles", () => {
    expect(normalizeInviteInput({ full_name: " Kari Nordmann ", email: " KARI@EXAMPLE.NO ", role: "manager" }))
      .toEqual({ fullName: "Kari Nordmann", email: "kari@example.no", role: "manager" });
    expect(normalizeInviteInput({ full_name: "Kari", email: "kari@example.no", role: "owner" }).role).toBe("agent");
  });

  it("rejects missing names and malformed email addresses", () => {
    expect(() => normalizeInviteInput({ full_name: "", email: "kari@example.no" })).toThrow("Navn");
    expect(() => normalizeInviteInput({ full_name: "Kari", email: "ikke-en-epost" })).toThrow("Ugyldig");
  });
});
