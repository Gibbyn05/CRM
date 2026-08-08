import { describe, expect, it } from "vitest";
import { lintEmail } from "./email-lint";

function codes(input: Parameters<typeof lintEmail>[0]) {
  return lintEmail(input).map((w) => w.code);
}

describe("lintEmail", () => {
  it("gir ingen advarsler for en ren, velformet e-post", () => {
    const warnings = lintEmail({
      subject: "Bekreftelse på din bestilling",
      html: "<p>Hei, her er bekreftelsen din. <a href=\"https://example.com/kvittering\">Se kvittering</a></p>",
      text: "Hei, her er bekreftelsen din. Se kvittering: https://example.com/kvittering",
      replyTo: "post@example.com",
    });
    expect(warnings).toHaveLength(0);
  });

  it("flagger emne med bare store bokstaver", () => {
    expect(codes({ subject: "BEKREFT KJØPET NÅ", html: "<p>hei</p>", text: "hei", replyTo: "a@b.no" })).toContain(
      "subject_all_caps",
    );
  });

  it("flagger flere utropstegn i emnet", () => {
    expect(
      codes({ subject: "Bekreft nå!!", html: "<p>hei</p>", text: "hei", replyTo: "a@b.no" }),
    ).toContain("subject_exclamations");
  });

  it("flagger for langt emne", () => {
    const subject = "A".repeat(40) + " " + "b".repeat(40);
    expect(codes({ subject, html: "<p>hei</p>", text: "hei", replyTo: "a@b.no" })).toContain(
      "subject_too_long",
    );
  });

  it("flagger kjente spam-fraser", () => {
    expect(
      codes({
        subject: "Tilbud",
        html: "<p>Dette er helt gratis, klikk her!</p>",
        text: "Dette er helt gratis, klikk her",
        replyTo: "a@b.no",
      }),
    ).toContain("spam_phrase");
  });

  it("flagger manglende tekstversjon", () => {
    expect(
      codes({ subject: "Bekreftelse", html: "<p>hei</p>", replyTo: "a@b.no" }),
    ).toContain("missing_text_version");
  });

  it("flagger manglende svaradresse", () => {
    expect(codes({ subject: "Bekreftelse", html: "<p>hei</p>", text: "hei" })).toContain(
      "missing_reply_to",
    );
  });

  it("flagger for mange lenker", () => {
    const links = Array.from({ length: 6 }, (_, i) => `<a href="https://example.com/${i}">Lenke ${i}</a>`).join(
      " ",
    );
    expect(
      codes({ subject: "Bekreftelse", html: `<p>${links}</p>`, text: "hei", replyTo: "a@b.no" }),
    ).toContain("too_many_links");
  });

  it("flagger URL-forkortere", () => {
    expect(
      codes({
        subject: "Bekreftelse",
        html: "<p><a href=\"https://bit.ly/abc123\">Se her</a></p>",
        text: "Se her",
        replyTo: "a@b.no",
      }),
    ).toContain("url_shortener");
  });

  it("flagger innebygde base64-bilder", () => {
    expect(
      codes({
        subject: "Bekreftelse",
        html: '<img src="data:image/png;base64,AAAA" />',
        text: "hei",
        replyTo: "a@b.no",
      }),
    ).toContain("inline_base64_image");
  });
});
