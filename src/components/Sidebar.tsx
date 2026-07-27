"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import Avatar from "./Avatar";
import Icon, { type IconName } from "./Icon";

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  managerOnly?: boolean;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Oversikt",
    items: [
      { href: "/dashboard", label: "Dashbord", icon: "dashboard" },
      { href: "/leaderboard", label: "Ledertavle", icon: "leaderboard" },
      { href: "/dagsavis", label: "Dagsavis", icon: "dagsavis" },
    ],
  },
  {
    title: "Salg",
    items: [
      { href: "/customers", label: "Kunder", icon: "customers" },
      { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
      { href: "/calendar", label: "Kalender", icon: "calendar" },
      { href: "/reminders", label: "Påminnelser", icon: "clock" },
    ],
  },
  {
    title: "Konto",
    items: [
      { href: "/profile", label: "Min profil", icon: "profile" },
      {
        href: "/organization",
        label: "Min organisasjon",
        icon: "building",
        managerOnly: true,
      },
      {
        href: "/users",
        label: "Brukere",
        icon: "customers",
        managerOnly: true,
      },
    ],
  },
];

export default function Sidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Husk komprimert tilstand, og eksponer bredden som CSS-variabel slik at den
  // faste statuslinja nederst kan justere seg (--sidebar-w).
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed") === "1";
    setCollapsed(saved);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-w",
      collapsed ? "4rem" : "16rem",
    );
  }, [collapsed]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isManager = profile?.role === "manager";
  const hide = collapsed ? "md:hidden" : "";

  return (
    <>
      {/* Mobil topbar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur md:hidden">
        <span className="flex items-center gap-2 font-bold text-slate-900">
          <BrandMark />
          Salgssentral
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Meny"
          aria-expanded={open}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <Icon name={open ? "close" : "menu"} />
        </button>
      </div>

      <aside
        className={`${
          open ? "flex" : "hidden"
        } w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:h-screen ${
          collapsed ? "md:w-16" : "md:w-64"
        }`}
      >
        {/* Merkevare + komprimer-knapp (kun desktop) */}
        <div
          className={`hidden items-center px-3 py-4 md:flex ${
            collapsed ? "md:justify-center" : "justify-between"
          }`}
        >
          <span className={`flex items-center gap-2.5 ${hide}`}>
            <BrandMark />
            <div className="leading-tight">
              <p className="text-base font-bold text-slate-900">Salgssentral</p>
              <p className="text-xs text-slate-400">
                {isManager ? "Salgssjef" : "Selger"}
              </p>
            </div>
          </span>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Utvid meny" : "Komprimer meny"}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={18} />
          </button>
        </div>

        {/* Navigasjon */}
        <nav
          className={`thin-scroll flex-1 space-y-6 py-4 ${
            collapsed
              ? "overflow-y-auto md:overflow-visible md:px-2"
              : "overflow-y-auto px-3"
          }`}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className={`label-eyebrow px-3 pb-2 ${hide}`}>
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items
                  .filter((item) => !item.managerOnly || isManager)
                  .map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      active={pathname.startsWith(item.href)}
                      collapsed={collapsed}
                      onClick={() => setOpen(false)}
                    />
                  ))}
                {group.title === "Konto" && isManager && (
                  <Link
                    href="/tv"
                    target="_blank"
                    onClick={() => setOpen(false)}
                    aria-label="TV-visning"
                    className={`group relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 ${
                      collapsed ? "md:justify-center md:gap-0 md:px-2" : "px-3"
                    }`}
                  >
                    <Icon
                      name="tv"
                      size={18}
                      className={`text-slate-400 transition-transform duration-150 ${
                        collapsed ? "md:group-hover:scale-110" : ""
                      }`}
                    />
                    <span className={hide}>TV-visning</span>
                    {collapsed && <RailTooltip label="TV-visning" />}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Bruker + logg ut */}
        <div className="mt-auto border-t border-slate-200 p-3">
          <div
            className={`flex items-center gap-3 rounded-xl px-2 py-2 ${
              collapsed ? "md:justify-center md:px-0" : ""
            }`}
          >
            <Avatar
              name={profile?.full_name || profile?.email || "?"}
              url={profile?.avatar_url}
              size={38}
            />
            <div className={`min-w-0 flex-1 ${hide}`}>
              <p className="truncate text-sm font-semibold text-slate-800">
                {profile?.full_name || "—"}
              </p>
              <p className="truncate text-xs text-slate-400">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            aria-label="Logg ut"
            className={`group relative mt-1 flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600 ${
              collapsed ? "md:justify-center md:gap-0 md:px-2" : "px-3"
            }`}
          >
            <Icon
              name="logout"
              size={18}
              className={`transition-transform duration-150 ${
                collapsed ? "md:group-hover:scale-110" : ""
              }`}
            />
            <span className={hide}>Logg ut</span>
            {collapsed && <RailTooltip label="Logg ut" />}
          </button>
        </div>
      </aside>
    </>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const hide = collapsed ? "md:hidden" : "";
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-xl py-2.5 text-sm transition ${
        collapsed ? "md:justify-center md:gap-0 md:px-2" : "px-3"
      } ${
        active
          ? "bg-brand-50 font-semibold text-brand-700"
          : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <Icon
        name={item.icon}
        size={18}
        className={`transition-transform duration-150 ${
          collapsed ? "md:group-hover:scale-110" : ""
        } ${active ? "text-brand-600" : "text-slate-400"}`}
      />
      <span className={hide}>{item.label}</span>
      {collapsed && <RailTooltip label={item.label} />}
    </Link>
  );
}

// Stilig tooltip som dukker opp til høyre for ikonet på hover når sidebaren er
// komprimert (kun desktop). Erstatter nettleserens standard title-tooltip.
function RailTooltip({ label }: { label: string }) {
  return (
    <span
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 -translate-x-1 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 md:block"
    >
      {label}
    </span>
  );
}

function BrandMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
      <Icon name="live" size={20} strokeWidth={2.25} />
    </span>
  );
}
