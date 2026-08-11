export const SIDEBAR_GROUP_IDS = ["overview", "sales", "account"] as const;
export type SidebarGroupId = (typeof SIDEBAR_GROUP_IDS)[number];

export interface SidebarItemPreference {
  href: string;
  visible: boolean;
}

export interface SidebarGroupPreference {
  id: SidebarGroupId;
  visible: boolean;
  items: SidebarItemPreference[];
}

export const SIDEBAR_GROUP_LABELS: Record<SidebarGroupId, string> = {
  overview: "Oversikt",
  sales: "Salg",
  account: "Konto",
};

export const MANAGER_ONLY_SIDEBAR_HREFS = new Set([
  "/team-analysis",
  "/leder-logg",
  "/kundereise",
  "/produkter",
  "/regnskap",
  "/organization",
  "/users",
  "/tv",
]);

export const DEFAULT_SIDEBAR_NAVIGATION: SidebarGroupPreference[] = [
  {
    id: "overview",
    visible: true,
    items: [
      "/dashboard",
      "/team-logg",
      "/leder-logg",
      "/team-analysis",
      "/leaderboard",
      "/dagsavis",
    ].map((href) => ({ href, visible: true })),
  },
  {
    id: "sales",
    visible: true,
    items: [
      "/customers",
      "/reachr",
      "/salg",
      "/pipeline",
      "/kundereise",
      "/produkter",
      "/calendar",
      "/reminders",
    ].map((href) => ({ href, visible: true })),
  },
  {
    id: "account",
    visible: true,
    items: [
      "/profile",
      "/min-inntekt",
      "/regnskap",
      "/organization",
      "/users",
      "/tv",
    ].map((href) => ({ href, visible: true })),
  },
];

export function normalizeSidebarNavigation(value: unknown): SidebarGroupPreference[] {
  const rows = Array.isArray(value) ? value : [];
  const defaults = new Map(DEFAULT_SIDEBAR_NAVIGATION.map((group) => [group.id, group]));
  const seenGroups = new Set<SidebarGroupId>();
  const result: SidebarGroupPreference[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const candidate = row as Record<string, unknown>;
    const id = candidate.id as SidebarGroupId;
    const fallback = defaults.get(id);
    if (!fallback || seenGroups.has(id)) continue;
    result.push({
      id,
      visible: candidate.visible !== false,
      items: normalizeItems(candidate.items, fallback.items),
    });
    seenGroups.add(id);
  }

  for (const fallback of DEFAULT_SIDEBAR_NAVIGATION) {
    if (!seenGroups.has(fallback.id)) {
      result.push({ ...fallback, items: fallback.items.map((item) => ({ ...item })) });
    }
  }
  return result;
}

export function sidebarNavigationForRole(
  groups: SidebarGroupPreference[],
  isManager: boolean,
): SidebarGroupPreference[] {
  if (isManager) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !MANAGER_ONLY_SIDEBAR_HREFS.has(item.href)),
  }));
}

function normalizeItems(value: unknown, defaults: SidebarItemPreference[]): SidebarItemPreference[] {
  const rows = Array.isArray(value) ? value : [];
  const allowed = new Map(defaults.map((item) => [item.href, item]));
  const seen = new Set<string>();
  const result: SidebarItemPreference[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const candidate = row as Record<string, unknown>;
    const href = typeof candidate.href === "string" ? candidate.href : "";
    if (!allowed.has(href) || seen.has(href)) continue;
    result.push({ href, visible: candidate.visible !== false });
    seen.add(href);
  }
  for (const fallback of defaults) {
    if (!seen.has(fallback.href)) result.push({ ...fallback });
  }
  return result;
}
