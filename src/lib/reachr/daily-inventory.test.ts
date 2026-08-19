import { describe, expect, it } from "vitest";
import { calculateDailyLeadInventory } from "./daily-inventory";

describe("calculateDailyLeadInventory", () => {
  it("fyller en tom arbeidsliste med 30 nye leads", () => {
    expect(calculateDailyLeadInventory(0)).toEqual({ carriedOver: 0, required: 30 });
  });

  it("tar med to ubehandlede leads og fyller på med 28", () => {
    expect(calculateDailyLeadInventory(2)).toEqual({ carriedOver: 2, required: 28 });
  });

  it("henter ikke nye leads når arbeidslisten allerede har 30", () => {
    expect(calculateDailyLeadInventory(30)).toEqual({ carriedOver: 30, required: 0 });
  });

  it("lar ikke eldre beholdning føre til mer enn 30 på dagens ringeliste", () => {
    expect(calculateDailyLeadInventory(47)).toEqual({ carriedOver: 30, required: 0 });
  });
});
