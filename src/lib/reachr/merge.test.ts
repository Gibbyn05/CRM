import { describe, expect, it } from "vitest";
import type { ReachrSearchResult } from "@/lib/reachr";
import { mergeSearchResults } from "./merge";

function makeCompany(overrides: Partial<ReachrSearchResult> = {}): ReachrSearchResult {
  return {
    org_number: "123456789",
    name: "Test AS",
    organization_form_code: "AS",
    organization_form: "Aksjeselskap",
    industry_code: null,
    industry: null,
    employees: null,
    website: null,
    email: null,
    phone: null,
    founded_at: null,
    vat_registered: false,
    business_register_registered: false,
    bankrupt: false,
    under_liquidation: false,
    purpose: null,
    address: { address: null, postal_code: null, city: null, municipality: null },
    matched_keyword: null,
    ...overrides,
  };
}

describe("mergeSearchResults", () => {
  it("lager ingen duplikater når samme org.nr finnes i begge lister", () => {
    const primary = [makeCompany({ org_number: "111111111" })];
    const extra = [makeCompany({ org_number: "111111111" })];
    const merged = mergeSearchResults(primary, extra);
    expect(merged).toHaveLength(1);
  });

  it("beholder matched_keyword fra hovedsøket når samme bedrift også kommer fra et søkeord", () => {
    const primary = [makeCompany({ org_number: "111111111", matched_keyword: null })];
    const extra = [makeCompany({ org_number: "111111111", matched_keyword: "regnskapsbyrå" })];
    const merged = mergeSearchResults(primary, extra);
    expect(merged[0].matched_keyword).toBeNull();
  });

  it("setter matched_keyword når bedriften kun kommer fra et søkeord", () => {
    const merged = mergeSearchResults(
      [],
      [makeCompany({ org_number: "222222222", matched_keyword: "revisjon" })],
    );
    expect(merged[0].matched_keyword).toBe("revisjon");
  });

  it("beholder første satte søkeord når bedriften finnes i to ulike søkeord-treff", () => {
    const merged = mergeSearchResults(
      [makeCompany({ org_number: "333333333", matched_keyword: "regnskap" })],
      [makeCompany({ org_number: "333333333", matched_keyword: "revisjon" })],
    );
    expect(merged[0].matched_keyword).toBe("regnskap");
  });

  it("beriker firmadata på tvers av kildene (fyller inn manglende felt)", () => {
    const merged = mergeSearchResults(
      [makeCompany({ org_number: "444444444", phone: null, website: "https://test.no" })],
      [makeCompany({ org_number: "444444444", phone: "+4790000000", website: null })],
    );
    expect(merged[0].phone).toBe("+4790000000");
    expect(merged[0].website).toBe("https://test.no");
  });

  it("hopper over rader uten org.nr", () => {
    const merged = mergeSearchResults([makeCompany({ org_number: "" })], []);
    expect(merged).toHaveLength(0);
  });
});
