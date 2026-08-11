import { describe, expect, it } from "vitest";
import { dedupeContracts, dedupeCustomers, dedupeDeals } from "./dedupe";

describe("dedupe", () => {
  it("shows one customer per organization number", () => {
    const rows = [
      { id: "a", org_number: "123 456 789", name: "A" },
      { id: "b", org_number: "123456789", name: "B" },
      { id: "c", org_number: null, name: "C" },
    ];
    expect(dedupeCustomers(rows).map((row) => row.id)).toEqual(["a", "c"]);
    expect(dedupeCustomers(rows, "b").map((row) => row.id)).toEqual(["b", "c"]);
  });

  it("removes exact logical deal duplicates while preserving distinct offers", () => {
    const base = { customer_id: "customer", title: " Abonnement ", amount: 499, stage: "akseptert" };
    const rows = [
      { ...base, id: "new" },
      { ...base, id: "old", title: "abonnement" },
      { ...base, id: "other-stage", stage: "tapt" },
      { ...base, id: "other-price", amount: 998 },
    ];
    expect(dedupeDeals(rows).map((row) => row.id)).toEqual(["new", "other-stage", "other-price"]);
  });

  it("collapses repeated contract deliveries in overview lists", () => {
    const base = { customer_id: "customer", deal_id: "deal", channel: "email", recipient: "kunde@example.no", status: "sent" };
    expect(dedupeContracts([{ ...base, id: "new" }, { ...base, id: "old" }]).map((row) => row.id)).toEqual(["new"]);
  });
});
