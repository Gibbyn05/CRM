"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Faner øverst i profil-området: egen profil og team (direktemeldinger).
const TABS = [
  { href: "/profile", label: "Min profil" },
  { href: "/profile/team", label: "Team" },
];

export default function ProfileTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const active =
          tab.href === "/profile"
            ? pathname === "/profile"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
