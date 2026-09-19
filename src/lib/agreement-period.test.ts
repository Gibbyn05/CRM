import { describe, expect, it } from "vitest";
import { calculateAgreementEndDate, formatAgreementPeriod } from "@/lib/agreement-period";

describe("agreement period", () => {
  it("beregner en måned fra valgt kalenderdato", () => {
    expect(calculateAgreementEndDate("2026-09-19", 1, "month")).toBe("2026-10-19");
  });

  it("bevarer korrekt månedsslutt", () => {
    expect(calculateAgreementEndDate("2026-01-31", 1, "month")).toBe("2026-02-28");
    expect(calculateAgreementEndDate("2028-02-29", 1, "year")).toBe("2029-02-28");
  });

  it("støtter dager, år og lesbare perioder", () => {
    expect(calculateAgreementEndDate("2026-09-19", 14, "day")).toBe("2026-10-03");
    expect(calculateAgreementEndDate("2026-09-19", 1, "year")).toBe("2027-09-19");
    expect(formatAgreementPeriod(1, "month")).toBe("1 måned");
    expect(formatAgreementPeriod(12, "month")).toBe("12 måneder");
  });
});
