import { describe, expect, it } from "vitest";
import { resolveSignedCopyRecipients } from "./contract-signing-email";

const profiles = [
  { id: "agent", full_name: "Selger", email: "seller@example.com", role: "agent" as const, is_active: true },
  { id: "manager", full_name: "Leder", email: "manager@example.com", role: "manager" as const, is_active: true },
  { id: "inactive-manager", full_name: "Tidligere leder", email: "old@example.com", role: "manager" as const, is_active: false },
];

describe("resolveSignedCopyRecipients", () => {
  it("inkluderer avsendende selger og aktive ledere", () => {
    expect(resolveSignedCopyRecipients(profiles, "agent").map((p) => p.id)).toEqual([
      "agent",
      "manager",
    ]);
  });

  it("dedupliserer samme e-postadresse", () => {
    const duplicated = [
      ...profiles,
      { id: "manager-2", full_name: "Leder 2", email: "SELLER@example.com", role: "manager" as const, is_active: true },
    ];
    expect(resolveSignedCopyRecipients(duplicated, "agent")).toHaveLength(2);
  });

  it("inkluderer avsenderen selv om profilen er deaktivert", () => {
    const inactiveAgent = [{ ...profiles[0], is_active: false }];
    expect(resolveSignedCopyRecipients(inactiveAgent, "agent")).toHaveLength(1);
  });
});
