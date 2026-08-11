export interface ExpiryRecipient {
  id: string;
  full_name: string;
  email: string;
  role: "agent" | "manager";
  is_active: boolean;
}

export function resolveExpiryRecipients(
  profiles: ExpiryRecipient[],
  agentId: string | null,
): ExpiryRecipient[] {
  const recipients = new Map<string, ExpiryRecipient>();

  for (const profile of profiles) {
    const isSeller = profile.id === agentId && profile.is_active;
    const isManager = profile.role === "manager" && profile.is_active;
    if (!isSeller && !isManager) continue;

    const email = profile.email.trim().toLowerCase();
    if (!email || recipients.has(email)) continue;
    recipients.set(email, profile);
  }

  return [...recipients.values()];
}

export function daysUntilDate(date: string, today: string): number {
  const targetMs = Date.parse(`${date}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  return Math.round((targetMs - todayMs) / 86_400_000);
}

export function osloDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

