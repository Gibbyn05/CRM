import { describe, expect, it } from "vitest";
import { resolveQuestionRange, type CrmAiQuestion } from "./crm-ai";

const base: CrmAiQuestion = {
  intent: "sales_total",
  entity: null,
  period: "month",
  start: null,
  end: null,
};

describe("resolveQuestionRange", () => {
  const now = new Date("2026-08-19T12:00:00+02:00");

  it("avgrenser de siste to ukene til 14 kalenderdager", () => {
    const [start, end] = resolveQuestionRange({ ...base, period: "two_weeks" }, now);
    expect(start.getDate()).toBe(6);
    expect(end.getDate()).toBe(19);
  });

  it("bruker eksplisitte datoer for egendefinert periode", () => {
    const [start, end] = resolveQuestionRange({ ...base, period: "custom", start: "2026-08-01", end: "2026-08-05" }, now);
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(5);
  });
});
