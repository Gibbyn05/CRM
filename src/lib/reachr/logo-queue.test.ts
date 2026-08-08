import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("./providers/logo1881", () => ({
  check1881Logo: vi.fn(),
  isLogo1881Configured: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { check1881Logo, isLogo1881Configured } from "./providers/logo1881";

type CachedRow = {
  org_number: string;
  status: string;
  match_method: string;
  message: string | null;
  attempt_count: number;
  checked_at: string | null;
  expires_at: string | null;
};

function makeFakeAdmin(cachedRows: CachedRow[]) {
  const upsertCalls: Record<string, unknown>[][] = [];
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      in: vi.fn(async () => ({ data: cachedRows, error: null })),
    })),
    upsert: vi.fn(async (rows: Record<string, unknown>[]) => {
      upsertCalls.push(rows);
      return { error: null };
    }),
  }));
  return { from, upsertCalls };
}

const company = (orgNumber: string) => ({
  org_number: orgNumber,
  name: `Bedrift ${orgNumber}`,
  address: null,
  phone: null,
});

describe("checkLogos", () => {
  beforeEach(() => {
    vi.mocked(check1881Logo).mockReset();
    vi.mocked(isLogo1881Configured).mockReset();
    vi.mocked(createAdminClient).mockReset();
  });

  it("bruker cachen når et fremdeles gyldig svar finnes (unngår unødvendig oppslag)", async () => {
    vi.mocked(isLogo1881Configured).mockReturnValue(true);
    const fakeAdmin = makeFakeAdmin([
      {
        org_number: "111111111",
        status: "found",
        match_method: "org_number",
        message: null,
        attempt_count: 1,
        checked_at: "2026-01-01T00:00:00.000Z",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin as never);

    const { checkLogos } = await import("./logo-queue");
    const results = await checkLogos([company("111111111")], "user-1");

    expect(check1881Logo).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        org_number: "111111111",
        status: "found",
        match_method: "org_number",
        checked_at: "2026-01-01T00:00:00.000Z",
        message: undefined,
        from_cache: true,
      },
    ]);
  });

  it("kontrollerer på nytt når cache-oppføringen er utløpt", async () => {
    vi.mocked(isLogo1881Configured).mockReturnValue(true);
    vi.mocked(check1881Logo).mockResolvedValue({
      status: "not_found",
      match_method: "none",
      transient: false,
    });
    const fakeAdmin = makeFakeAdmin([
      {
        org_number: "222222222",
        status: "found",
        match_method: "org_number",
        message: null,
        attempt_count: 1,
        checked_at: "2020-01-01T00:00:00.000Z",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin as never);

    const { checkLogos } = await import("./logo-queue");
    const results = await checkLogos([company("222222222")], "user-1");

    expect(check1881Logo).toHaveBeenCalledTimes(1);
    expect(results[0].from_cache).toBe(false);
    expect(results[0].status).toBe("not_found");
  });

  it("prøver på nytt ved midlertidige feil, opptil maks antall forsøk", async () => {
    vi.mocked(isLogo1881Configured).mockReturnValue(true);
    vi.mocked(check1881Logo)
      .mockResolvedValueOnce({ status: "not_checked", match_method: "none", transient: true })
      .mockResolvedValueOnce({ status: "not_checked", match_method: "none", transient: true })
      .mockResolvedValueOnce({ status: "not_checked", match_method: "none", transient: true });
    const fakeAdmin = makeFakeAdmin([]);
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin as never);

    const { checkLogos } = await import("./logo-queue");
    await checkLogos([company("333333333")], "user-1");

    // MAX_LOGO_CHECK_ATTEMPTS = 3 — skal ikke fortsette i det uendelige.
    expect(check1881Logo).toHaveBeenCalledTimes(3);
  }, 10000);

  it("stopper umiddelbart ved en endelig (ikke-midlertidig) feil, uten å bruke hele retry-budsjettet", async () => {
    vi.mocked(isLogo1881Configured).mockReturnValue(true);
    vi.mocked(check1881Logo).mockResolvedValue({
      status: "not_checked",
      match_method: "none",
      transient: false,
    });
    const fakeAdmin = makeFakeAdmin([]);
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin as never);

    const { checkLogos } = await import("./logo-queue");
    await checkLogos([company("444444444")], "user-1");

    expect(check1881Logo).toHaveBeenCalledTimes(1);
  });

  it("bruker kun ett forsøk når 1881 ikke er konfigurert (sparer retry-budsjett på noe som aldri kan lykkes)", async () => {
    vi.mocked(isLogo1881Configured).mockReturnValue(false);
    vi.mocked(check1881Logo).mockResolvedValue({
      status: "not_checked",
      match_method: "none",
      message: "Krever datakildetilgang: mangler API1881_KEY.",
      transient: true,
    });
    const fakeAdmin = makeFakeAdmin([]);
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin as never);

    const { checkLogos } = await import("./logo-queue");
    const results = await checkLogos([company("555555555")], "user-1");

    expect(check1881Logo).toHaveBeenCalledTimes(1);
    expect(results[0].status).toBe("not_checked");
  });

  it("lagrer status, matchmetode og tidspunkt for hver kontroll (logg)", async () => {
    vi.mocked(isLogo1881Configured).mockReturnValue(true);
    vi.mocked(check1881Logo).mockResolvedValue({
      status: "uncertain",
      match_method: "name_address_phone",
      transient: false,
    });
    const fakeAdmin = makeFakeAdmin([]);
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin as never);

    const { checkLogos } = await import("./logo-queue");
    await checkLogos([company("666666666")], "user-42");

    expect(fakeAdmin.upsertCalls).toHaveLength(1);
    const [row] = fakeAdmin.upsertCalls[0];
    expect(row).toMatchObject({
      org_number: "666666666",
      status: "uncertain",
      match_method: "name_address_phone",
      provider: "1881",
      checked_by: "user-42",
    });
    expect(row.checked_at).toBeTruthy();
    expect(row.expires_at).toBeTruthy();
  });

  it("kontrollerer flere bedrifter i kontrollerte puljer (ikke alle samtidig)", async () => {
    vi.mocked(isLogo1881Configured).mockReturnValue(true);
    vi.mocked(check1881Logo).mockResolvedValue({
      status: "not_found",
      match_method: "none",
      transient: false,
    });
    const fakeAdmin = makeFakeAdmin([]);
    vi.mocked(createAdminClient).mockReturnValue(fakeAdmin as never);

    const orgNumbers = Array.from({ length: 7 }, (_, i) => `10000000${i}`);
    const { checkLogos } = await import("./logo-queue");
    const results = await checkLogos(orgNumbers.map(company), "user-1");

    expect(results).toHaveLength(7);
    expect(check1881Logo).toHaveBeenCalledTimes(7);
    // Puljestørrelse 3 -> minst 3 separate upsert-kall (ett per pulje).
    expect(fakeAdmin.upsertCalls.length).toBeGreaterThanOrEqual(3);
  });
});
