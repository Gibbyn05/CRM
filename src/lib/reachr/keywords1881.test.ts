import { describe, expect, it } from "vitest";
import { extractPublicPhone } from "@/lib/reachr/keywords1881";

describe("extractPublicPhone", () => {
  it("henter norsk telefon fra en offentlig 1881-lenke", () => {
    const html = '<a href="tel:004799791299">99 79 12 99</a>';
    expect(extractPublicPhone(html, "935121159")).toBe("+4799791299");
  });

  it("avviser organisasjonsnummer som telefon", () => {
    const html = '<a href="tel:935121159">935 121 159</a>';
    expect(extractPublicPhone(html, "935121159")).toBeNull();
  });
});
