"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import Avatar from "./Avatar";

const NAV = [
  { href: "/live", label: "Live-tavle", icon: "📊" },
  { href: "/customers", label: "Kunder", icon: "👥" },
  { href: "/pipeline", label: "Pipeline", icon: "📈" },
  { href: "/calendar", label: "Kalender", icon: "📅" },
  { href: "/leaderboard", label: "Ledertavle", icon: "🏆" },
  { href: "/dagsavis", label: "Dagsavis", icon: "📰" },
  { href: "/profile", label: "Min profil", icon: "👤" },
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
          open ? "flex" : "hidden"
        } w-full shrink-0 flex-col bg-slate-900 text-slate-100 md:flex md:min-h-screen md:w-60`}
      >
        <div className="hidden p-5 md:block">
          <h1 className="text-lg font-bold">Salgssentral</h1>
          <p className="text-xs text-slate-400">
            {isManager ? "Salgssjef" : "Selger"}
          </p>
        </div>

        {/* Navigasjon (fyller tilgjengelig plass) */}
        <nav className="flex-1 space-y-1 p-3">
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

        {/* Bruker + logg ut, pinnet nederst i kolonnen */}
        <div className="mt-auto border-t border-slate-800 p-3">
          <div className="flex items-center gap-3 px-1 py-2">
            <Avatar
              name={profile?.full_name || profile?.email || "?"}
              url={profile?.avatar_url}
              size={36}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {profile?.full_name || "—"}
              </p>
              <p className="truncate text-xs text-slate-400">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
          >
            🚪 Logg ut
          </button>
        </div>
      </aside>
    </>
  );
}
