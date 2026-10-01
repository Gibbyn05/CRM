import { describe, expect, it } from "vitest";
import { activityActor, activityMessage, type ActivityFeedItem } from "@/lib/activity-feed";

const activity: ActivityFeedItem = {
  activity_id: "note:1",
  activity_type: "note",
  customer_id: "customer-1",
  customer_name: "Eksempel AS",
  agent_id: "user-1",
  agent_name: "Test Selger",
  title: "Notat",
  summary: "Ring kunden fredag",
  occurred_at: "2026-09-29T08:52:00Z",
  details: {},
};

describe("activity feed attribution", () => {
  it("shows a note as a message from its recorded profile", () => {
    expect(activityActor(activity)).toBe("Test Selger");
    expect(activityMessage(activity)).toBe("Ring kunden fredag");
  });

  it("does not invent a profile when the event has no user ID", () => {
    expect(activityActor({ ...activity, agent_id: null, agent_name: "Ukjent" })).toBe("System");
    expect(activityActor({ ...activity, activity_type: "payment" })).toBe("Betalingssystem");
    expect(activityActor({ ...activity, activity_type: "signature", details: { "Signert av": "Kunde Navn" } })).toBe("Kunde Navn");
  });

  it("keeps event context without repeating an offer title", () => {
    expect(activityMessage({ ...activity, activity_type: "task", title: "Oppgave", summary: "Send tilbud" })).toBe("Oppgave: Send tilbud");
    expect(activityMessage({ ...activity, activity_type: "offer", title: "Annonse", summary: "Annonse" })).toBe("Annonse");
  });
});
