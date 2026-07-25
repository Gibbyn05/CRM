"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Profile } from "@/lib/types";
import Avatar from "./Avatar";
import Icon from "./Icon";
import NotificationBell from "./NotificationBell";

// Slank topplinje med hurtigsøk og brukerchip. Søket hopper til kundelista der
// den fulle søkefunksjonen bor.
export default function Topbar({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const firstName = (profile?.full_name || "").split(/\s+/)[0];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(q.trim() ? `/customers?q=${encodeURIComponent(q.trim())}` : "/customers");
  }

  return (
    <header className="sticky top-0 z-30 hidden items-center gap-4 border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur md:flex">
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-500">
          {firstName ? (
            <>
              Velkommen tilbake,{" "}
              <span className="font-semibold text-slate-800">{firstName}</span>
            </>
          ) : (
            "Velkommen tilbake"
          )}
        </p>
      </div>

      <form onSubmit={submit} className="relative ml-auto w-full max-w-sm">
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Søk etter kunde …"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </form>

      {profile?.id && <NotificationBell userId={profile.id} />}

      <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
        <Avatar
          name={profile?.full_name || profile?.email || "?"}
          url={profile?.avatar_url}
          size={36}
        />
        <div className="hidden leading-tight lg:block">
          <p className="text-sm font-semibold text-slate-800">
            {profile?.full_name || "—"}
          </p>
          <p className="text-xs text-slate-400">
            {profile?.role === "manager" ? "Salgssjef" : "Selger"}
          </p>
        </div>
      </div>
    </header>
  );
}
