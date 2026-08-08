import { describe, expect, it } from "vitest";
import { suggestInternalKeywords } from "./keywords";

describe("suggestInternalKeywords", () => {
  it("foreslår relaterte bransjeord for et kjent nøkkelord", () => {
    const suggestions = suggestInternalKeywords("regnskap");
    const keywords = suggestions.map((item) => item.keyword);
    expect(keywords).toContain("revisjon");
    expect(keywords).not.toContain("regnskap");
    expect(suggestions.every((item) => item.source === "internal")).toBe(true);
  });

  it("bruker bransjefeltet fremfor søkeordet når begge er satt", () => {
    const suggestions = suggestInternalKeywords("noe helt annet", "elektriker");
    const keywords = suggestions.map((item) => item.keyword);
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords).not.toContain("noe helt annet");
    expect(keywords).toContain("rørlegger");
  });

  it("returnerer tom liste når ingen bransjekode kan gjettes", () => {
    expect(suggestInternalKeywords("xyzxyzxyz")).toEqual([]);
  });

  it("returnerer tom liste for tomt søk", () => {
    expect(suggestInternalKeywords("")).toEqual([]);
  });
});
