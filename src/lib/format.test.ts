import { describe, expect, it } from "vitest";
import { normalizePhoneNumber } from "@/lib/format";

describe("normalizePhoneNumber", () => {
  it("normaliserer norske nummer til tel-vennlig E.164-format", () => {
    expect(normalizePhoneNumber("912 34 567")).toBe("+4791234567");
    expect(normalizePhoneNumber("47 912 34 567")).toBe("+4791234567");
    expect(normalizePhoneNumber("+47 912 34 567")).toBe("+4791234567");
    expect(normalizePhoneNumber("0047 912 34 567")).toBe("+4791234567");
  });

  it("beholder gyldige internasjonale nummer og avviser ufullstendige nummer", () => {
    expect(normalizePhoneNumber("+46 70 123 45 67")).toBe("+46701234567");
    expect(normalizePhoneNumber("12345")).toBeNull();
    expect(normalizePhoneNumber(null)).toBeNull();
  });
});
