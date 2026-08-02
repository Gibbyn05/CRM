"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/reachr/leadssok", label: "Leadssøk" },
  { href: "/reachr/mine-leads", label: "Mine leads" },
];

export default function ReachrTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#d8c9b0] pb-4">
      <div>
        <p className="label-eyebrow">Offentlige norske bedriftsdata</p>
        <h1 className="font-display text-4xl font-black tracking-[-0.04em] text-[#2b2118] md:text-5xl">
          Reachr
        </h1>
      </div>
      <div className="rounded-2xl border border-[#d8c9b0] bg-[#fffaf0]/75 p-1 shadow-sm">
        {tabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`inline-flex rounded-xl px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-[#171717] text-[#09fe94] shadow-sm"
                  : "text-[#6f5a43] hover:bg-[#efe1c7] hover:text-[#2b2118]"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
