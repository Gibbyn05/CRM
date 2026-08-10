import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_WIDGETS,
  normalizeDashboardWidgets,
} from "@/lib/dashboard-widgets";

describe("normalizeDashboardWidgets", () => {
  it("bevarer gyldig personlig rekkefølge, synlighet og farge", () => {
    const result = normalizeDashboardWidgets([
      { id: "tasks", visible: false, color: "rose" },
      { id: "calls", visible: true, color: "sky" },
    ]);

    expect(result[0]).toEqual({ id: "tasks", visible: false, color: "rose" });
    expect(result[1]).toEqual({ id: "calls", visible: true, color: "sky" });
    expect(result).toHaveLength(DEFAULT_DASHBOARD_WIDGETS.length);
  });

  it("avviser ukjente widgets, duplikater og ugyldige farger", () => {
    const result = normalizeDashboardWidgets([
      { id: "stats", visible: true, color: "ukjent" },
      { id: "stats", visible: false, color: "rose" },
      { id: "admin", visible: true, color: "mint" },
    ]);

    expect(result.filter((widget) => widget.id === "stats")).toHaveLength(1);
    expect(result[0].color).toBe("mint");
    expect(result.some((widget) => widget.id === ("admin" as never))).toBe(false);
  });
});
