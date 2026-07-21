"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/live", label: "Live-tavle", icon: "📊", managerHint: false },
  { href: "/customers", label: "Kunder", icon: "👥", managerHint: false },
  { href: "/pipeline", label: "Pipeline", icon: "📈", managerHint: false },
  { href: "/calendar", label: "Kalender", icon: "📅", managerHint: false },
  { href: "/leaderboard", label: "Ledertavle", icon: "🏆", managerHint: false },
  { href: "/dagsavis", label: "Dagsavis", icon: "📰", managerHint: false },
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
      {/* Mobil topbar */}
      <div className="flex items-center justify-between bg-slate-900 p-3 text-white md:hidden">
        <span className="font-bold">Salgssentral</span>
        <button onClick={() => setOpen((o) => !o)} aria-label="Meny">
          ☰
        </button>
      </div>

      <aside
        className={`${
          open ? "block" : "hidden"
        } w-full shrink-0 bg-slate-900 text-slate-100 md:block md:w-60`}
      >
        <div className="hidden p-5 md:block">
          <h1 className="text-lg font-bold">Salgssentral</h1>
          <p className="text-xs text-slate-400">
            {isManager ? "Salgssjef" : "Selger"}
          </p>
        </div>

        <nav className="space-y-1 p-3">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-slate-700 font-medium text-white"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}

          {isManager && (
            <Link
              href="/tv"
              target="_blank"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              <span>📺</span>
              <span>TV-visning</span>
            </Link>
          )}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <p className="px-3 text-sm font-medium">{profile?.full_name || "—"}</p>
          <p className="px-3 text-xs text-slate-400">{profile?.email}</p>
          <button
            onClick={signOut}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
          >
            Logg ut
          </button>
        </div>
      </aside>
    </>
  );
}
