import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_NAVIGATION,
  normalizeSidebarNavigation,
  sidebarNavigationForRole,
} from "@/lib/sidebar-navigation";

describe("normalizeSidebarNavigation", () => {
  it("bevarer rekkefølge og synlighet for kategorier og sider", () => {
    const result = normalizeSidebarNavigation([
      {
        id: "sales",
        visible: true,
        items: [
          { href: "/pipeline", visible: true },
          { href: "/customers", visible: false },
        ],
      },
      { id: "overview", visible: false, items: [] },
    ]);

    expect(result[0].id).toBe("sales");
    expect(result[0].items[0]).toEqual({ href: "/pipeline", visible: true });
    expect(result[0].items[1]).toEqual({ href: "/customers", visible: false });
    expect(result[1].visible).toBe(false);
    expect(result).toHaveLength(DEFAULT_SIDEBAR_NAVIGATION.length);
  });

  it("fjerner ukjente og dupliserte menypunkter", () => {
    const result = normalizeSidebarNavigation([
      {
        id: "overview",
        visible: true,
        items: [
          { href: "/dashboard", visible: true },
          { href: "/dashboard", visible: false },
          { href: "/admin", visible: true },
        ],
      },
    ]);

    expect(result[0].items.filter((item) => item.href === "/dashboard")).toHaveLength(1);
    expect(result[0].items.some((item) => item.href === "/admin")).toBe(false);
  });

  it("fjerner det utgåtte kommunikasjonspunktet fra lagrede menyer", () => {
    const result = normalizeSidebarNavigation([
      {
        id: "account",
        visible: true,
        items: [
          { href: "/organization", visible: true },
          { href: "/innstillinger/kommunikasjon", visible: true },
        ],
      },
    ]);

    const account = result.find((group) => group.id === "account");
    expect(account?.items.some((item) => item.href === "/innstillinger/kommunikasjon")).toBe(false);
  });

  it("skjuler lederfaner fra selgerens menyinnstillinger", () => {
    const sellerNavigation = sidebarNavigationForRole(
      normalizeSidebarNavigation(null),
      false,
    );
    const hrefs = sellerNavigation.flatMap((group) =>
      group.items.map((item) => item.href),
    );

    expect(hrefs).not.toContain("/team-analysis");
    expect(hrefs).not.toContain("/produkter");
    expect(hrefs).not.toContain("/regnskap");
    expect(hrefs).not.toContain("/organization");
    expect(hrefs).not.toContain("/users");
    expect(hrefs).not.toContain("/tv");
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/customers");
  });

  it("beholder lederfaner for ledere", () => {
    const navigation = normalizeSidebarNavigation(null);
    expect(sidebarNavigationForRole(navigation, true)).toBe(navigation);
  });
});
