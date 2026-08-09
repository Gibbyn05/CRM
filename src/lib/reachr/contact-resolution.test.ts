import { assert, describe, it } from "vitest";
import type { ReachrCompany, ReachrContactCandidate } from "@/lib/reachr";
import { resolveReachrContact } from "@/lib/reachr/contact-resolution";

const baseCompany: ReachrCompany = {
  org_number: "123456789",
  name: "Eksempel Bedrift AS",
  organization_form_code: "AS",
  organization_form: "Aksjeselskap",
  industry_code: null,
  industry: null,
  employees: null,
  website: null,
  email: null,
  phone: null,
  founded_at: null,
  vat_registered: true,
  business_register_registered: true,
  bankrupt: false,
  under_liquidation: false,
  purpose: null,
  address: {
    address: null,
    postal_code: "0150",
    city: "Oslo",
    municipality: "Oslo",
  },
  roles: [
    { role_code: "DAGL", role_name: "Daglig leder", name: "Ada Nordmann", postal_code: "0470" },
    { role_code: "LEDE", role_name: "Styreleder", name: "Per Hansen", postal_code: "5003" },
  ],
};

describe("resolveReachrContact", () => {
  it("prioriterer verifisert daglig leder foran styreleder og hovednummer", () => {
    const resolved = resolveReachrContact({
      ...baseCompany,
      contact_candidates: [
        person("Per Hansen", "LEDE", "+4792222222"),
        companyMain("+4722222222"),
        person("Ada Nordmann", "DAGL", "+4791111111"),
      ],
    });

    assert.equal(resolved.phone, "+4791111111");
    assert.equal(resolved.selected_contact?.priority, "daily_manager");
    assert.deepEqual(resolved.selected_contact?.matched_fields, [
      "navn",
      "rolle",
      "organisasjonsnummer",
    ]);
  });

  it("avviser navnematch når rollen ikke matcher", () => {
    const wrongRole = person("Ada Nordmann", "LEDE", "+4791111111");
    const resolved = resolveReachrContact({
      ...baseCompany,
      contact_candidates: [wrongRole, companyMain("+4722222222")],
    });

    assert.equal(resolved.phone, "+4722222222");
    assert.equal(resolved.selected_contact?.priority, "company_main");
    assert.match(
      resolved.contact_candidates?.find((candidate) => candidate.subject === "person")
        ?.rejection_reason ?? "",
      /Navn og rolle matcher ikke/,
    );
  });

  it("avviser person uten verifisert bedriftstilknytning", () => {
    const unlinked = {
      ...person("Ada Nordmann", "DAGL", "+4791111111"),
      org_number: null,
      company_name: "En Annen Bedrift AS",
    };
    const resolved = resolveReachrContact({
      ...baseCompany,
      contact_candidates: [unlinked, companyMain("+4722222222")],
    });

    assert.equal(resolved.phone, "+4722222222");
    assert.equal(resolved.selected_contact?.subject, "company");
  });

  it("bruker postnummer som ekstra støtte, ikke som erstatning for bedriftsmatch", () => {
    const candidate = {
      ...person("Ada Nordmann", "DAGL", "+4791111111"),
      postal_code: "0470",
    };
    const resolved = resolveReachrContact({
      ...baseCompany,
      contact_candidates: [candidate],
    });

    assert.equal(resolved.selected_contact?.confidence, 100);
    assert.ok(resolved.selected_contact?.matched_fields.includes("postnummer"));
  });
});

function person(
  name: string,
  roleCode: "DAGL" | "LEDE",
  phone: string,
): ReachrContactCandidate {
  return {
    phone,
    subject: "person",
    priority: roleCode === "DAGL" ? "daily_manager" : "chairperson",
    person_name: name,
    role_code: roleCode,
    role_name: roleCode === "DAGL" ? "Daglig leder" : "Styreleder",
    company_name: baseCompany.name,
    org_number: baseCompany.org_number,
    postal_code: null,
    provider: "test",
    provider_label: "Testkilde",
    source_context: "org_number_lookup",
    verified: false,
    confidence: 0,
    matched_fields: [],
  };
}

function companyMain(phone: string): ReachrContactCandidate {
  return {
    phone,
    subject: "company",
    priority: "company_main",
    person_name: null,
    role_code: null,
    role_name: null,
    company_name: baseCompany.name,
    org_number: baseCompany.org_number,
    postal_code: null,
    provider: "test",
    provider_label: "Testkilde",
    source_context: "org_number_lookup",
    verified: false,
    confidence: 0,
    matched_fields: [],
  };
}
