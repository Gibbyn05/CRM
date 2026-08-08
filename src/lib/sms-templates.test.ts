import { describe, expect, it } from "vitest";
import { buildReminderVars, renderReminderSms, renderTemplate } from "./sms-templates";

describe("renderTemplate", () => {
  it("erstatter enkle variabler", () => {
    expect(renderTemplate("Hei {{kundenavn}}!", { kundenavn: "Kari" } as never)).toBe(
      "Hei Kari!",
    );
  });

  it("viser valgfri seksjon når feltet har innhold", () => {
    const out = renderTemplate("Møte{{#sted}} ({{sted}}){{/sted}}.", {
      sted: "Kontoret",
    } as never);
    expect(out).toBe("Møte (Kontoret).");
  });

  it("skjuler valgfri seksjon når feltet er tomt", () => {
    const out = renderTemplate("Møte{{#sted}} ({{sted}}){{/sted}}.", { sted: "" } as never);
    expect(out).toBe("Møte.");
  });
});

describe("renderReminderSms", () => {
  const vars = buildReminderVars({
    customerName: "Kari Nordmann",
    agentName: "Ola Selger",
    startsAtIso: "2026-06-15T10:00:00Z",
    location: "Kontoret",
    orgName: "Testfirma",
    timeZone: "Europe/Oslo",
  });

  it("bruker standardmal for kunde når ingen egen mal er satt", () => {
    const text = renderReminderSms(null, "customer", vars);
    expect(text).toContain("Kari Nordmann");
    expect(text).toContain("Ola Selger");
    expect(text).toContain("Testfirma");
  });

  it("bruker standardmal for selger når ingen egen mal er satt", () => {
    const text = renderReminderSms(undefined, "agent", vars);
    expect(text).toContain("Kari Nordmann");
  });

  it("bruker egen mal når satt", () => {
    const text = renderReminderSms("Custom: {{kundenavn}}", "customer", vars);
    expect(text).toBe("Custom: Kari Nordmann");
  });

  it("hopper over sted-seksjonen når sted mangler", () => {
    const varsNoLocation = buildReminderVars({
      customerName: "Kari",
      agentName: "Ola",
      startsAtIso: "2026-06-15T10:00:00Z",
      location: null,
      orgName: "Testfirma",
      timeZone: "Europe/Oslo",
    });
    const text = renderReminderSms(null, "customer", varsNoLocation);
    expect(text).not.toContain("()");
  });
});
