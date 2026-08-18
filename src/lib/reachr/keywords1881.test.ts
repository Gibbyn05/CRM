import { describe, expect, it } from "vitest";
import {
  extract1881KeywordsFromHtml,
  extract1881ProfilePath,
  extract1881ProfilePaths,
  extractPublicPhone,
} from "@/lib/reachr/keywords1881";

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

describe("extract1881ProfilePath", () => {
  it("følger firmakortet fra et oppslag på organisasjonsnummer", () => {
    const html = '<a href="/radio-og-tv/p4-lyden-av-norge_100219537S11/?query=963789505">P4 Lyden av Norge</a>';
    expect(extract1881ProfilePath(html, "963789505")).toBe(
      "/radio-og-tv/p4-lyden-av-norge_100219537S11/",
    );
  });

  it("returnerer null når resultatet ikke har en firmakortlenke", () => {
    expect(extract1881ProfilePath('<a href="/emneknagger/radio">radio</a>', "963789505")).toBeNull();
  });

  it("finner inntil tre firmakort for samme organisasjonsnummer", () => {
    const html = [
      '<a href="/radio/p4-radio_100S1/?query=963789505">P4 Radio</a>',
      '<a href="/radio/p4-lyden_100S2/?query=963789505">P4 Lyden</a>',
    ].join("");
    expect(extract1881ProfilePaths(html, "963789505")).toEqual([
      "/radio/p4-radio_100S1/",
      "/radio/p4-lyden_100S2/",
    ]);
  });
});

describe("extract1881KeywordsFromHtml", () => {
  it("henter søkeord fra firmakortets emneknagger", () => {
    const html = [
      '<h2>Søkeord</h2>',
      '<li><a href="/emneknagger/radio/oslo">radio</a></li>',
      '<li><a href="/emneknagger/p4/oslo">P4</a></li>',
    ].join("");
    expect(extract1881KeywordsFromHtml(html)).toEqual(["radio", "P4"]);
  });
});
