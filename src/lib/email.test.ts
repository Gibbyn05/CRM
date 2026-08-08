import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractDomain, verifyResendWebhookSignature } from "./email";

const SECRET = "whsec_" + Buffer.from("test-secret-bytes-1234").toString("base64");

function sign(id: string, timestamp: string, payload: string, secret = SECRET): string {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${payload}`;
  const sig = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  return `v1,${sig}`;
}

describe("verifyResendWebhookSignature", () => {
  it("godtar en gyldig signatur", () => {
    const payload = JSON.stringify({ type: "email.delivered" });
    const svixId = "msg_123";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const svixSignature = sign(svixId, svixTimestamp, payload);

    expect(
      verifyResendWebhookSignature({ payload, svixId, svixTimestamp, svixSignature, secret: SECRET }),
    ).toBe(true);
  });

  it("avviser en forfalsket signatur", () => {
    const payload = JSON.stringify({ type: "email.delivered" });
    const svixId = "msg_123";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));

    expect(
      verifyResendWebhookSignature({
        payload,
        svixId,
        svixTimestamp,
        svixSignature: "v1,ikkeenGyldigSignaturString==",
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("avviser når nyttelasten er endret etter signering", () => {
    const svixId = "msg_123";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const svixSignature = sign(svixId, svixTimestamp, JSON.stringify({ type: "email.delivered" }));

    expect(
      verifyResendWebhookSignature({
        payload: JSON.stringify({ type: "email.bounced" }),
        svixId,
        svixTimestamp,
        svixSignature,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("avviser et for gammelt tidsstempel (replay-beskyttelse)", () => {
    const payload = JSON.stringify({ type: "email.delivered" });
    const svixId = "msg_123";
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 60 * 60);
    const svixSignature = sign(svixId, oldTimestamp, payload);

    expect(
      verifyResendWebhookSignature({
        payload,
        svixId,
        svixTimestamp: oldTimestamp,
        svixSignature,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it("avviser når headere mangler", () => {
    expect(
      verifyResendWebhookSignature({
        payload: "{}",
        svixId: null,
        svixTimestamp: null,
        svixSignature: null,
        secret: SECRET,
      }),
    ).toBe(false);
  });
});

describe("extractDomain", () => {
  it("henter domenet fra en 'Navn <adresse@domene>'-streng", () => {
    expect(extractDomain("Salgssentral <noreply@reachr.no>")).toBe("reachr.no");
  });

  it("henter domenet fra en ren adresse", () => {
    expect(extractDomain("post@example.com")).toBe("example.com");
  });

  it("returnerer null når det ikke finnes en adresse", () => {
    expect(extractDomain("Salgssentral")).toBeNull();
  });
});
