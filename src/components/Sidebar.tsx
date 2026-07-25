"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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
    ],
  },
  {
    title: "Konto",
    items: [{ href: "/profile", label: "Min profil", icon: "profile" }],
  },
];

export default function Sidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isManager = profile?.role === "manager";

  return (
    <>
      {/* Mobil topbar (fast øverst, med safe-area for iPhone-hakk) */}
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
        } w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:min-h-screen md:w-64`}
      >
        {/* Merkevare */}
        <div className="hidden items-center gap-2.5 px-5 py-5 md:flex">
          <BrandMark />
          <div className="leading-tight">
            <p className="text-[15px] font-bold text-slate-900">Salgssentral</p>
            <p className="text-xs text-slate-400">
              {isManager ? "Salgssjef" : "Selger"}
            </p>
          </div>
        </div>

        {/* Navigasjon (fyller tilgjengelig plass) */}
        <nav className="thin-scroll flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
                      onClick={() => setOpen(false)}
                    />
                  ))}
                {group.title === "Konto" && isManager && (
                  <Link
                    href="/tv"
                    target="_blank"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Icon name="tv" size={18} className="text-slate-400" />
                    <span>TV-visning</span>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Bruker + logg ut, pinnet nederst i kolonnen */}
        <div className="mt-auto border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Avatar
              name={profile?.full_name || profile?.email || "?"}
              url={profile?.avatar_url}
              size={38}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">
                {profile?.full_name || "—"}
              </p>
              <p className="truncate text-xs text-slate-400">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <Icon name="logout" size={18} />
            <span>Logg ut</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? "bg-brand-50 font-semibold text-brand-700"
          : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <Icon
        name={item.icon}
        size={18}
        className={active ? "text-brand-600" : "text-slate-400"}
      />
      <span>{item.label}</span>
    </Link>
  );
}

function BrandMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
      <Icon name="live" size={20} strokeWidth={2.25} />
    </span>
  );
}
