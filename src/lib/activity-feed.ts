export type ActivityType = "call" | "email" | "meeting" | "note" | "task" | "status" | "offer" | "signature" | "payment";

export interface ActivityFeedItem {
  activity_id: string;
  activity_type: ActivityType;
  customer_id: string;
  customer_name: string;
  agent_id: string | null;
  agent_name: string;
  agent_avatar_url?: string | null;
  title: string;
  summary: string;
  occurred_at: string;
  details: Record<string, string>;
}

export function activityActor(activity: ActivityFeedItem) {
  if (activity.activity_type === "signature") return activity.details?.["Signert av"] || "Kunde";
  if (activity.activity_type === "payment") return "Betalingssystem";
  if (!activity.agent_id) return "System";
  return activity.agent_name && activity.agent_name !== "Ukjent" ? activity.agent_name : "Tidligere bruker";
}

export function activityMessage(activity: ActivityFeedItem) {
  if (activity.activity_type === "note") return activity.summary || "Notat registrert";
  if (["meeting", "task"].includes(activity.activity_type)) {
    return `${activity.title}: ${activity.summary}`;
  }
  return activity.summary || activity.title;
}
