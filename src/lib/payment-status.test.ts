import { describe, expect, it } from "vitest";
import { getPaymentStatus } from "./payment-status";

describe("getPaymentStatus", () => {
  it("prioriterer registrert betaling", () => {
    expect(
      getPaymentStatus(
        { status: "betalt", paid_at: "2026-08-10T10:00:00Z", due_at: "2026-08-01" },
        "2026-08-10",
      ),
    ).toBe("paid");
  });

  it("viser over forfall når fristen er passert", () => {
    expect(
      getPaymentStatus(
        { status: "fakturert", paid_at: null, due_at: "2026-08-09" },
        "2026-08-10",
      ),
    ).toBe("overdue");
  });

  it("viser ikke betalt før fristen", () => {
    expect(
      getPaymentStatus(
        { status: "fakturert", paid_at: null, due_at: "2026-08-10" },
        "2026-08-10",
      ),
    ).toBe("unpaid");
  });
});
