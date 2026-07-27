import { describe, expect, it } from "vitest";
import { contractDisplayStatus, isValidOrgNumber } from "./format";

describe("isValidOrgNumber", () => {
  it("godtar et gyldig org.nr med korrekt MOD11-kontrollsiffer", () => {
    // 923609016 = Brønnøysundregisteret sitt eget org.nr (offentlig kjent).
    expect(isValidOrgNumber("923609016")).toBe(true);
  });

  it("avviser feil kontrollsiffer", () => {
    expect(isValidOrgNumber("923609017")).toBe(false);
  });

  it("avviser feil lengde", () => {
    expect(isValidOrgNumber("12345")).toBe(false);
    expect(isValidOrgNumber("1234567890")).toBe(false);
  });

  it("avviser ikke-siffer", () => {
    expect(isValidOrgNumber("92360901a")).toBe(false);
  });
});

describe("contractDisplayStatus", () => {
  it("viser 'expired' når expired_at er satt og status ikke er signed/declined", () => {
    expect(
      contractDisplayStatus({ status: "sent", expired_at: "2026-01-01T00:00:00Z" }),
    ).toBe("expired");
    expect(
      contractDisplayStatus({ status: "opened", expired_at: "2026-01-01T00:00:00Z" }),
    ).toBe("expired");
  });

  it("beholder virkelig status når expired_at er null", () => {
    expect(contractDisplayStatus({ status: "sent", expired_at: null })).toBe("sent");
  });

  it("signert/avslått overstyrer aldri en satt expired_at", () => {
    expect(
      contractDisplayStatus({ status: "signed", expired_at: "2026-01-01T00:00:00Z" }),
    ).toBe("signed");
    expect(
      contractDisplayStatus({ status: "declined", expired_at: "2026-01-01T00:00:00Z" }),
    ).toBe("declined");
  });
});
