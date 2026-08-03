"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import Avatar from "./Avatar";
import DagsavisModal from "./DagsavisModal";
import Icon, { type IconName } from "./Icon";
import NotificationBell from "./NotificationBell";

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
      { href: "/reachr", label: "Reachr", icon: "reachr" },
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
        href: "/regnskap",
        label: "Regnskap",
        icon: "receipt",
        managerOnly: true,
      },
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
  const [dagsavisOpen, setDagsavisOpen] = useState(false);

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

  useEffect(() => {
    if (!profile?.id) return;
    const todayKey = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Oslo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const storageKey = `dagsavis-auto-open:${profile.id}`;
    if (localStorage.getItem(storageKey) === todayKey) return;
    localStorage.setItem(storageKey, todayKey);
    setDagsavisOpen(true);
  }, [profile?.id]);

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
  const hide = collapsed ? "lg:hidden" : "";

  return (
    <>
      {/* Mobil topbar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#d8c9b0] bg-[#fffaf0]/92 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur lg:hidden">
        <span className="flex items-center gap-2 font-display text-xl font-bold text-[#2b2118]">
          <BrandMark />
          Salgssentral
        </span>
        <div className="flex items-center gap-1">
          <Link
            href="/customers"
            aria-label="Søk etter kunde"
            className="rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <Icon name="search" size={20} />
          </Link>
          {profile?.id && <NotificationBell userId={profile.id} />}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Meny"
            aria-expanded={open}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>

      <aside
        className={`${
          open ? "flex" : "hidden"
        } w-full shrink-0 flex-col border-r border-[#4d3a2a] bg-[#171717] lg:flex lg:h-screen ${
          collapsed ? "lg:w-16" : "lg:w-64"
        }`}
      >
        {/* Merkevare + komprimer-knapp (kun desktop) */}
        <div
          className={`hidden items-center px-3 py-4 lg:flex ${
            collapsed ? "lg:justify-center" : "justify-between"
          }`}
        >
          <span className={`flex items-center gap-2.5 ${hide}`}>
            <BrandMark />
            <div className="leading-tight">
              <p className="font-display text-xl font-bold leading-none text-[#fffaf0]">Salgssentral</p>
              <p className="mt-1 text-xs text-[#d9bd8f]/70">
                {isManager ? "Salgssjef" : "Selger"}
              </p>
            </div>
          </span>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Utvid meny" : "Komprimer meny"}
            className="rounded-xl p-2 text-[#d9bd8f]/55 transition hover:bg-white/10 hover:text-[#fffaf0] active:scale-[0.97]"
          >
            <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={18} />
          </button>
        </div>

        {/* Navigasjon */}
        <nav
          className={`thin-scroll flex-1 space-y-6 py-4 ${
            collapsed
              ? "overflow-y-auto lg:overflow-visible lg:px-2"
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
                        onOpenDagsavis={() => setDagsavisOpen(true)}
                      />
                    ))}
                {group.title === "Konto" && isManager && (
                  <Link
                    href="/tv"
                    target="_blank"
                    onClick={() => setOpen(false)}
                    aria-label="TV-visning"
                    className={`group relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium text-[#fffaf0]/60 transition hover:bg-white/10 hover:text-[#fffaf0] active:scale-[0.98] ${
                      collapsed ? "lg:justify-center lg:gap-0 lg:px-2" : "px-3"
                    }`}
                  >
                    <Icon
                      name="tv"
                      size={18}
                      className={`text-[#d9bd8f]/50 transition-transform duration-150 ${
                        collapsed ? "lg:group-hover:scale-110" : ""
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
        <div className="mt-auto border-t border-white/10 p-3">
          <div
            className={`flex items-center gap-3 rounded-xl px-2 py-2 ${
              collapsed ? "lg:justify-center lg:px-0" : ""
            }`}
          >
            <Avatar
              name={profile?.full_name || profile?.email || "?"}
              url={profile?.avatar_url}
              size={38}
            />
            <div className={`min-w-0 flex-1 ${hide}`}>
              <p className="truncate text-sm font-semibold text-[#fffaf0]">
                {profile?.full_name || "—"}
              </p>
              <p className="truncate text-xs text-[#d9bd8f]/55">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            aria-label="Logg ut"
            className={`group relative mt-1 flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-medium text-[#fffaf0]/50 transition hover:bg-white/10 hover:text-[#ffad0a] active:scale-[0.98] ${
              collapsed ? "lg:justify-center lg:gap-0 lg:px-2" : "px-3"
            }`}
          >
            <Icon
              name="logout"
              size={18}
              className={`transition-transform duration-150 ${
                collapsed ? "lg:group-hover:scale-110" : ""
              }`}
            />
            <span className={hide}>Logg ut</span>
            {collapsed && <RailTooltip label="Logg ut" />}
          </button>
        </div>
      </aside>

      <DagsavisModal
        open={dagsavisOpen}
        onOpenChange={setDagsavisOpen}
        profile={profile}
      />
    </>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  onClick,
  onOpenDagsavis,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  onOpenDagsavis: () => void;
}) {
  const hide = collapsed ? "lg:hidden" : "";
  if (item.href === "/dagsavis") {
    return (
      <button
        type="button"
        onClick={() => {
          onOpenDagsavis();
          onClick();
        }}
        className={`group relative flex w-full items-center gap-3 rounded-xl py-2.5 text-left text-sm font-medium text-[#fffaf0]/60 transition hover:bg-white/10 hover:text-[#fffaf0] active:scale-[0.98] ${
          collapsed ? "lg:justify-center lg:gap-0 lg:px-2" : "px-3"
        }`}
      >
        <Icon
          name={item.icon}
          size={18}
          className={`text-[#d9bd8f]/50 transition-transform duration-150 ${
            collapsed ? "lg:group-hover:scale-110" : ""
          }`}
        />
        <span className={hide}>{item.label}</span>
        {collapsed && <RailTooltip label={item.label} />}
      </button>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-xl py-2.5 text-sm transition active:scale-[0.98] ${
        collapsed ? "lg:justify-center lg:gap-0 lg:px-2" : "px-3"
      } ${
        active
          ? "bg-white/10 font-semibold text-[#09fe94]"
          : "font-medium text-[#fffaf0]/60 hover:bg-white/10 hover:text-[#fffaf0]"
      }`}
    >
      <Icon
        name={item.icon}
        size={18}
        className={`transition-transform duration-150 ${
          collapsed ? "lg:group-hover:scale-110" : ""
        } ${active ? "text-[#09fe94]" : "text-[#d9bd8f]/50"}`}
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
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 -translate-x-1 whitespace-nowrap rounded-md bg-[#2b2118] px-2.5 py-1 text-xs font-medium text-[#fffaf0] opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 lg:block"
    >
      {label}
    </span>
  );
}

function BrandMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#09fe94] text-[#171717] shadow-[0_10px_28px_rgba(9,254,148,0.18)]">
      <Icon name="live" size={20} strokeWidth={2.25} />
    </span>
  );
}
