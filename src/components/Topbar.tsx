"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Customer, Profile } from "@/lib/types";
import { formatOrgNumber } from "@/lib/format";
import Avatar from "./Avatar";
import Icon from "./Icon";
import NotificationBell from "./NotificationBell";

type Hit = Pick<Customer, "id" | "name" | "org_number" | "city">;

// Slank topplinje med live hurtigsøk: en dropdown fylles mens man skriver, og
// man kan hoppe rett til et kundekort. Enter (eller «Se alle»-raden) går til
// den fulle kundelista.
export default function Topbar({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const firstName = (profile?.full_name || "").split(/\s+/)[0];

  // Live-søk (debounced) mot kundebasen.
  useEffect(() => {
    const trimmed = q.trim();
    if (!trimmed) {
      setHits([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const handle = setTimeout(async () => {
      let query = supabase
        .from("customers")
        .select("id, name, org_number, city")
        .order("name")
        .limit(8);
      query = /^\d+$/.test(trimmed)
        ? query.ilike("org_number", `${trimmed}%`)
        : query.ilike("name", `%${trimmed}%`);
      const { data } = await query;
      if (!alive) return;
      setHits((data as Hit[]) ?? []);
      setActive(-1);
      setLoading(false);
    }, 200);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [q, supabase]);

  // Lukk dropdown ved klikk utenfor.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function goToList() {
    setOpen(false);
    router.push(
      q.trim() ? `/customers?q=${encodeURIComponent(q.trim())}` : "/customers",
    );
  }

  function goToCustomer(id: string) {
    setOpen(false);
    setQ("");
    setHits([]);
    router.push(`/customers/${id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && hits[active]) goToCustomer(hits[active].id);
      else goToList();
    }
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

      <div ref={boxRef} className="relative ml-auto w-full max-w-sm">
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          placeholder="Søk etter kunde …"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        />

        {open && q.trim() && (
          <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {loading && hits.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-400">Søker …</p>
            )}
            {!loading && hits.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-400">
                Ingen kunder matcher «{q.trim()}».
              </p>
            )}
            {hits.map((h, i) => (
              <button
                key={h.id}
                onClick={() => goToCustomer(h.id)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                  i === active ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
                  {h.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {h.name}
                  </span>
                  <span className="block truncate text-xs text-slate-400">
                    {h.org_number ? `Org.nr ${formatOrgNumber(h.org_number)}` : "—"}
                    {h.city ? ` · ${h.city}` : ""}
                  </span>
                </span>
              </button>
            ))}
            <Link
              href={`/customers?q=${encodeURIComponent(q.trim())}`}
              onClick={() => setOpen(false)}
              className="block border-t border-slate-100 px-4 py-2.5 text-sm font-medium text-brand-600 hover:bg-slate-50"
            >
              Se alle treff for «{q.trim()}» →
            </Link>
          </div>
        )}
      </div>

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
