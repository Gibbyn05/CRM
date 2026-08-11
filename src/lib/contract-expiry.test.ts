import { describe, expect, it } from "vitest";
import { daysUntilDate, resolveExpiryRecipients } from "./contract-expiry";

const profiles = [
  { id: "seller", full_name: "Selger", email: "seller@example.no", role: "agent" as const, is_active: true },
  { id: "manager", full_name: "Leder", email: "manager@example.no", role: "manager" as const, is_active: true },
  { id: "inactive", full_name: "Inaktiv", email: "inactive@example.no", role: "manager" as const, is_active: false },
  { id: "other", full_name: "Annen", email: "other@example.no", role: "agent" as const, is_active: true },
];

describe("resolveExpiryRecipients", () => {
  it("varsler ansvarlig selger og aktive ledere", () => {
    expect(resolveExpiryRecipients(profiles, "seller").map((profile) => profile.id)).toEqual([
      "seller",
      "manager",
    ]);
  });

  it("utelater inaktive profiler og andre selgere", () => {
    expect(resolveExpiryRecipients(profiles, null).map((profile) => profile.id)).toEqual(["manager"]);
  });
});

describe("daysUntilDate", () => {
  it("regner hele kalenderdager uten tidssoneforskyvning", () => {
    expect(daysUntilDate("2026-09-10", "2026-08-11")).toBe(30);
    expect(daysUntilDate("2026-08-11", "2026-08-11")).toBe(0);
  });
});

