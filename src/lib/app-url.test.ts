import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicAppUrl } from "./app-url";

describe("getPublicAppUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the canonical .com address when the old .no address is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://crm.media-norge.no");
    expect(getPublicAppUrl()).toBe("https://crm.media-norge.com");
  });

  it("uses the configured public address and removes a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://crm.media-norge.com/");
    expect(getPublicAppUrl()).toBe("https://crm.media-norge.com");
  });
});
