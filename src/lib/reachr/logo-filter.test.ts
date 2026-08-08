import { describe, expect, it } from "vitest";
import { shouldHideCompany } from "./logo-filter";

describe("shouldHideCompany", () => {
  it("skjuler aldri noe når filteret er avslått", () => {
    expect(shouldHideCompany("found", false)).toBe(false);
    expect(shouldHideCompany("not_found", false)).toBe(false);
    expect(shouldHideCompany("uncertain", false)).toBe(false);
    expect(shouldHideCompany("not_checked", false)).toBe(false);
    expect(shouldHideCompany(undefined, false)).toBe(false);
  });

  it("skjuler kun bekreftet 'found' når filteret er på", () => {
    expect(shouldHideCompany("found", true)).toBe(true);
  });

  it("viser usikre treff selv når filteret er på (antar aldri match)", () => {
    expect(shouldHideCompany("uncertain", true)).toBe(false);
  });

  it("viser ikke-kontrollerte bedrifter selv når filteret er på (feil skal aldri skjule)", () => {
    expect(shouldHideCompany("not_checked", true)).toBe(false);
    expect(shouldHideCompany(undefined, true)).toBe(false);
  });

  it("viser bekreftet 'not_found' når filteret er på", () => {
    expect(shouldHideCompany("not_found", true)).toBe(false);
  });
});
