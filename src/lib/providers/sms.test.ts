import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("sms provider (sveve)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SVEVE_USER;
    delete process.env.SVEVE_PASSWORD;
    delete process.env.SMS_PROVIDER;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("er ikke konfigurert uten SVEVE_USER/SVEVE_PASSWORD", async () => {
    const { isSmsConfigured } = await import("./sms");
    expect(isSmsConfigured()).toBe(false);
  });

  it("sendSms feiler tydelig (og ikke transient) når leverandør mangler konfigurasjon", async () => {
    const { sendSms } = await import("./sms");
    const result = await sendSms("+4790000000", "Test", "CRM");
    expect(result.ok).toBe(false);
    expect(result.transient).toBe(false);
    expect(result.error).toMatch(/ikke konfigurert/i);
  });

  it("avviser ugyldig telefonnummer før leverandøren kalles", async () => {
    process.env.SVEVE_USER = "bruker";
    process.env.SVEVE_PASSWORD = "passord";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { sendSms } = await import("./sms");
    const result = await sendSms("ikke-et-nummer", "Test", "CRM");

    expect(result.ok).toBe(false);
    expect(result.transient).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("markerer vellykket sending når Sveve svarer med et positivt meldings-id", async () => {
    process.env.SVEVE_USER = "bruker";
    process.env.SVEVE_PASSWORD = "passord";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "12345",
      }),
    );

    const { sendSms } = await import("./sms");
    const result = await sendSms("+4790000000", "Test", "CRM");

    expect(result.ok).toBe(true);
    expect(result.provider).toBe("sveve");
    expect(result.provider_ref).toBe("12345");
  });

  it("markerer endelig (ikke-transient) feil når Sveve avviser meldingen", async () => {
    process.env.SVEVE_USER = "bruker";
    process.env.SVEVE_PASSWORD = "passord";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "-3 Ugyldig mottaker",
      }),
    );

    const { sendSms } = await import("./sms");
    const result = await sendSms("+4790000000", "Test", "CRM");

    expect(result.ok).toBe(false);
    expect(result.transient).toBe(false);
  });

  it("markerer transient feil ved 5xx-svar fra Sveve", async () => {
    process.env.SVEVE_USER = "bruker";
    process.env.SVEVE_PASSWORD = "passord";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      }),
    );

    const { sendSms } = await import("./sms");
    const result = await sendSms("+4790000000", "Test", "CRM");

    expect(result.ok).toBe(false);
    expect(result.transient).toBe(true);
  });

  it("markerer transient feil ved nettverksfeil (fetch kaster)", async () => {
    process.env.SVEVE_USER = "bruker";
    process.env.SVEVE_PASSWORD = "passord";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const { sendSms } = await import("./sms");
    const result = await sendSms("+4790000000", "Test", "CRM");

    expect(result.ok).toBe(false);
    expect(result.transient).toBe(true);
    expect(result.error).toMatch(/network down/);
  });
});
