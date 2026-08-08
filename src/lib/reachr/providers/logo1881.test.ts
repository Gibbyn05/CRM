import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("matchLogoCandidate", () => {
  it("matcher sikkert på organisasjonsnummer, selv om navn avviker", async () => {
    const { matchLogoCandidate } = await import("./logo1881");
    const result = matchLogoCandidate(
      { org_number: "123456789", name: "Gammelt Navn AS", address: null, phone: null },
      { org_number: "123 456 789", name: "Nytt Navn AS", address: null, phone: null, has_logo: true },
    );
    expect(result).toEqual({ matched: true, method: "org_number", uncertain: false });
  });

  it("matcher på normalisert navn + adresse når org.nr ikke stemmer/mangler", async () => {
    const { matchLogoCandidate } = await import("./logo1881");
    const result = matchLogoCandidate(
      { org_number: "123456789", name: "Ole Hansen AS", address: "Storgata 1, 0155 Oslo", phone: null },
      { org_number: null, name: "OLE HANSEN A/S", address: "storgata 1, 0155 oslo", phone: null, has_logo: false },
    );
    expect(result.matched).toBe(true);
    expect(result.method).toBe("name_address_phone");
    expect(result.uncertain).toBe(false);
  });

  it("matcher på normalisert navn + telefon når adresse mangler", async () => {
    const { matchLogoCandidate } = await import("./logo1881");
    const result = matchLogoCandidate(
      { org_number: "123456789", name: "Kari Nordmann AS", address: null, phone: "+4790000000" },
      { org_number: null, name: "Kari Nordmann AS", address: null, phone: "90000000", has_logo: true },
    );
    expect(result.matched).toBe(true);
    expect(result.method).toBe("name_address_phone");
  });

  it("gir usikker match ved likt navn men uten adresse/telefon å bekrefte", async () => {
    const { matchLogoCandidate } = await import("./logo1881");
    const result = matchLogoCandidate(
      { org_number: "123456789", name: "Ole Hansen AS", address: null, phone: null },
      { org_number: null, name: "Ole Hansen AS", address: null, phone: null, has_logo: true },
    );
    expect(result.matched).toBe(false);
    expect(result.uncertain).toBe(true);
  });

  it("gir usikker match ved likt navn men avvikende adresse OG telefon (antar aldri likt navn = samme bedrift)", async () => {
    const { matchLogoCandidate } = await import("./logo1881");
    const result = matchLogoCandidate(
      {
        org_number: "123456789",
        name: "Norsk Bygg AS",
        address: "Kirkegata 5, 0153 Oslo",
        phone: "+4790000001",
      },
      {
        org_number: null,
        name: "Norsk Bygg AS",
        address: "Havnegata 12, 5003 Bergen",
        phone: "+4790000002",
        has_logo: true,
      },
    );
    expect(result.matched).toBe(false);
    expect(result.uncertain).toBe(true);
  });

  it("gir ingen match når navnet er helt ulikt", async () => {
    const { matchLogoCandidate } = await import("./logo1881");
    const result = matchLogoCandidate(
      { org_number: "123456789", name: "Ole Hansen AS", address: null, phone: null },
      { org_number: "987654321", name: "Kari Nordmann AS", address: null, phone: null, has_logo: true },
    );
    expect(result).toEqual({ matched: false, method: "none", uncertain: false });
  });
});

describe("check1881Logo", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.API1881_KEY;
    delete process.env.API1881_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("returnerer not_checked (ikke-transient) uten API1881_KEY", async () => {
    const { check1881Logo } = await import("./logo1881");
    const result = await check1881Logo({
      org_number: "123456789",
      name: "Test AS",
      address: null,
      phone: null,
    });
    expect(result.status).toBe("not_checked");
    expect(result.transient).toBe(false);
    expect(result.message).toMatch(/API1881_KEY/);
  });

  it("returnerer not_checked (ikke-transient) uten API1881_BASE_URL", async () => {
    process.env.API1881_KEY = "test-key";
    const { check1881Logo } = await import("./logo1881");
    const result = await check1881Logo({
      org_number: "123456789",
      name: "Test AS",
      address: null,
      phone: null,
    });
    expect(result.status).toBe("not_checked");
    expect(result.transient).toBe(false);
    expect(result.message).toMatch(/API1881_BASE_URL/);
  });

  it("returnerer not_found ved 404 fra 1881", async () => {
    process.env.API1881_KEY = "test-key";
    process.env.API1881_BASE_URL = "https://example.test/1881";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { check1881Logo } = await import("./logo1881");
    const result = await check1881Logo({
      org_number: "123456789",
      name: "Test AS",
      address: null,
      phone: null,
    });
    expect(result.status).toBe("not_found");
    expect(result.transient).toBe(false);
  });

  it("markerer transient feil ved 5xx (kan prøves på nytt)", async () => {
    process.env.API1881_KEY = "test-key";
    process.env.API1881_BASE_URL = "https://example.test/1881";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { check1881Logo } = await import("./logo1881");
    const result = await check1881Logo({
      org_number: "123456789",
      name: "Test AS",
      address: null,
      phone: null,
    });
    expect(result.status).toBe("not_checked");
    expect(result.transient).toBe(true);
  });

  it("markerer ikke-transient feil ved 4xx utenom 404 (gjentas ikke)", async () => {
    process.env.API1881_KEY = "test-key";
    process.env.API1881_BASE_URL = "https://example.test/1881";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const { check1881Logo } = await import("./logo1881");
    const result = await check1881Logo({
      org_number: "123456789",
      name: "Test AS",
      address: null,
      phone: null,
    });
    expect(result.status).toBe("not_checked");
    expect(result.transient).toBe(false);
  });

  it("markerer transient feil ved nettverksfeil/avbrutt oppslag (kaster unntak)", async () => {
    process.env.API1881_KEY = "test-key";
    process.env.API1881_BASE_URL = "https://example.test/1881";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("The operation was aborted")));
    const { check1881Logo } = await import("./logo1881");
    const result = await check1881Logo({
      org_number: "123456789",
      name: "Test AS",
      address: null,
      phone: null,
    });
    expect(result.status).toBe("not_checked");
    expect(result.transient).toBe(true);
  });

  it("returnerer found når et bekreftet treff har registrert logo", async () => {
    process.env.API1881_KEY = "test-key";
    process.env.API1881_BASE_URL = "https://example.test/1881";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ orgNumber: "123456789", name: "Test AS", hasLogo: true }),
      }),
    );
    const { check1881Logo } = await import("./logo1881");
    const result = await check1881Logo({
      org_number: "123456789",
      name: "Test AS",
      address: null,
      phone: null,
    });
    expect(result.status).toBe("found");
    expect(result.match_method).toBe("org_number");
  });

  it("returnerer not_found når et bekreftet treff mangler logo", async () => {
    process.env.API1881_KEY = "test-key";
    process.env.API1881_BASE_URL = "https://example.test/1881";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ orgNumber: "123456789", name: "Test AS", hasLogo: false }),
      }),
    );
    const { check1881Logo } = await import("./logo1881");
    const result = await check1881Logo({
      org_number: "123456789",
      name: "Test AS",
      address: null,
      phone: null,
    });
    expect(result.status).toBe("not_found");
  });
});
