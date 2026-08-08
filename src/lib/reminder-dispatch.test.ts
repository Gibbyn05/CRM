import { describe, expect, it } from "vitest";
import { computeBackoffMinutes, MAX_REMINDER_ATTEMPTS, shouldRetry } from "./reminder-dispatch";

describe("computeBackoffMinutes", () => {
  it("dobler ventetiden for hvert forsøk", () => {
    expect(computeBackoffMinutes(0)).toBe(5);
    expect(computeBackoffMinutes(1)).toBe(10);
    expect(computeBackoffMinutes(2)).toBe(20);
    expect(computeBackoffMinutes(3)).toBe(40);
  });
});

describe("shouldRetry", () => {
  it("prøver på nytt ved midlertidig feil under maks antall forsøk", () => {
    expect(shouldRetry(true, 1)).toBe(true);
  });

  it("gir opp umiddelbart ved en endelig (ikke-midlertidig) feil", () => {
    expect(shouldRetry(false, 1)).toBe(false);
  });

  it("gir opp når maks antall forsøk er nådd, selv ved midlertidig feil", () => {
    expect(shouldRetry(true, MAX_REMINDER_ATTEMPTS)).toBe(false);
  });

  it("prøver fortsatt på nytt rett under maksgrensen", () => {
    expect(shouldRetry(true, MAX_REMINDER_ATTEMPTS - 1)).toBe(true);
  });
});
