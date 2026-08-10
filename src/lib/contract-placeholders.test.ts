import { describe, expect, it } from "vitest";
import { fillContractPlaceholders } from "./contract-placeholders";

describe("fillContractPlaceholders", () => {
  it("fills repeated CRM variables deterministically", () => {
    const result = fillContractPlaceholders(
      "{{customer.name}} godtar avtalen. Kunde: {{ customer.name }}.",
      { "customer.name": "Eksempel AS" },
    );
    expect(result.text).toBe("Eksempel AS godtar avtalen. Kunde: Eksempel AS.");
    expect(result.used).toEqual(["customer.name"]);
    expect(result.missing).toEqual([]);
  });

  it("does not guess missing or unknown variables", () => {
    const result = fillContractPlaceholders(
      "{{customer.phone}} {{made.up}}",
      { "customer.phone": "" },
    );
    expect(result.text).toBe("{{customer.phone}} {{made.up}}");
    expect(result.missing).toEqual(["customer.phone"]);
    expect(result.unknown).toEqual(["made.up"]);
  });
});
