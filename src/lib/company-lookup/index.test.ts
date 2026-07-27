import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CompanyNotFoundError,
  InvalidOrgNumberError,
  lookupCompany,
} from "./index";

const VALID_ORGNR = "923609016"; // Brønnøysundregisteret sitt eget org.nr

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("lookupCompany", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PROVIDER_1881_API_KEY;
    delete process.env.PROVIDER_1881_API_URL;
    delete process.env.PROVIDER_GULESIDER_API_KEY;
    delete process.env.PROVIDER_180_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it("kaster InvalidOrgNumberError for ugyldig org.nr uten å gjøre nettverkskall", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(lookupCompany("123")).rejects.toBeInstanceOf(InvalidOrgNumberError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("kaster CompanyNotFoundError når Brreg svarer 404", async () => {
    global.fetch = vi.fn(async () => jsonResponse({}, 404)) as unknown as typeof fetch;
    await expect(lookupCompany(VALID_ORGNR)).rejects.toBeInstanceOf(CompanyNotFoundError);
  });

  it("henter navn + daglig leder fra Brreg og merker kilden, uten telefonileverandør konfigurert", async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes("/roller")) {
        return jsonResponse({
          rollegrupper: [
            {
              type: { kode: "DAGL" },
              roller: [
                { type: { kode: "DAGL" }, fratraadt: false, person: { navn: { fornavn: "Kari", etternavn: "Nordmann" } } },
              ],
            },
          ],
        });
      }
      return jsonResponse({
        organisasjonsnummer: VALID_ORGNR,
        navn: "Eksempel AS",
        forretningsadresse: { adresse: ["Gate 1"], postnummer: "0001", poststed: "OSLO" },
      });
    }) as unknown as typeof fetch;

    const result = await lookupCompany(VALID_ORGNR);

    expect(result.name).toEqual({ value: "Eksempel AS", source: "brreg" });
    expect(result.ceo_name).toEqual({ value: "Kari Nordmann", source: "brreg" });
    expect(result.city).toEqual({ value: "Oslo", source: "brreg" });
    expect(result.phone).toEqual({ value: null, source: null });
    expect(result.notes.some((n) => n.includes("ingen telefonileverandør"))).toBe(true);
  });

  it("henter telefonnummer fra en konfigurert leverandør og merker kilden", async () => {
    process.env.PROVIDER_1881_API_KEY = "test-key";
    process.env.PROVIDER_1881_API_URL = "https://example.test/phone";

    global.fetch = vi.fn(async (url: string) => {
      if (url.includes("/roller")) return jsonResponse({ rollegrupper: [] });
      if (url.startsWith("https://example.test/phone")) {
        return jsonResponse({ phone: "40000000" });
      }
      return jsonResponse({ organisasjonsnummer: VALID_ORGNR, navn: "Eksempel AS" });
    }) as unknown as typeof fetch;

    const result = await lookupCompany(VALID_ORGNR);
    expect(result.phone).toEqual({ value: "40000000", source: "provider_1881" });
  });
});
