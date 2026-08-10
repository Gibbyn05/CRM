export const DASHBOARD_WIDGET_IDS = [
  "attention",
  "stats",
  "calls",
  "tasks",
  "recent",
  "deals",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];
export type DashboardWidgetColor = "sand" | "mint" | "sky" | "rose" | "lilac" | "amber";

export interface DashboardWidgetPreference {
  id: DashboardWidgetId;
  visible: boolean;
  color: DashboardWidgetColor;
}

export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  attention: "Krever oppmerksomhet",
  stats: "Nøkkeltall",
  calls: "Samtaler",
  tasks: "Oppgaver",
  recent: "Sist ringt",
  deals: "Aktive avtaler",
};

export const DASHBOARD_WIDGET_COLORS: Record<
  DashboardWidgetColor,
  { label: string; background: string; border: string; dot: string }
> = {
  sand: { label: "Sand", background: "#fffaf0", border: "#d8c9b0", dot: "#bda98b" },
  mint: { label: "Mint", background: "#effcf5", border: "#9fd9bd", dot: "#20a86b" },
  sky: { label: "Himmel", background: "#f0f7fb", border: "#a9cadb", dot: "#4d9abf" },
  rose: { label: "Rose", background: "#fff3ef", border: "#e5b9aa", dot: "#cc7257" },
  lilac: { label: "Syrin", background: "#f8f3fb", border: "#cbb6d6", dot: "#9670aa" },
  amber: { label: "Rav", background: "#fff8e8", border: "#e2c786", dot: "#bd8617" },
};

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetPreference[] = [
  { id: "attention", visible: true, color: "sand" },
  { id: "stats", visible: true, color: "mint" },
  { id: "calls", visible: true, color: "sky" },
  { id: "tasks", visible: true, color: "amber" },
  { id: "recent", visible: true, color: "lilac" },
  { id: "deals", visible: true, color: "rose" },
];

const COLOR_IDS = new Set<DashboardWidgetColor>(
  Object.keys(DASHBOARD_WIDGET_COLORS) as DashboardWidgetColor[],
);

export function normalizeDashboardWidgets(value: unknown): DashboardWidgetPreference[] {
  const rows = Array.isArray(value) ? value : [];
  const defaults = new Map(DEFAULT_DASHBOARD_WIDGETS.map((widget) => [widget.id, widget]));
  const seen = new Set<DashboardWidgetId>();
  const normalized: DashboardWidgetPreference[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const candidate = row as Record<string, unknown>;
    const id = candidate.id as DashboardWidgetId;
    const fallback = defaults.get(id);
    if (!fallback || seen.has(id)) continue;
    const color = COLOR_IDS.has(candidate.color as DashboardWidgetColor)
      ? (candidate.color as DashboardWidgetColor)
      : fallback.color;
    normalized.push({ id, visible: candidate.visible !== false, color });
    seen.add(id);
  }

  for (const fallback of DEFAULT_DASHBOARD_WIDGETS) {
    if (!seen.has(fallback.id)) normalized.push({ ...fallback });
  }
  return normalized;
}
