import { describe, expect, it } from "vitest";
import { generateSigningToken } from "./tokens";

describe("generateSigningToken", () => {
  it("gir en lang, url-trygg streng (base64url, ingen +/=/)", () => {
    const token = generateSigningToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("gir en unik token for hvert kall", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSigningToken()));
    expect(tokens.size).toBe(50);
  });
});
