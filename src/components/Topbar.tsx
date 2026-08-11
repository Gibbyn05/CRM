"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { dedupeCustomers } from "@/lib/dedupe";
import type { Customer, Profile } from "@/lib/types";
import { formatOrgNumber } from "@/lib/format";
import Avatar from "./Avatar";
import Icon from "./Icon";
import NotificationBell from "./NotificationBell";

type Hit = Pick<Customer, "id" | "name" | "org_number" | "city" | "phone">;

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
  const updatesMatch = /oppdater|endringslogg|hva er nytt|nytt i reachr/i.test(q.trim());

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
        .select("id, name, org_number, city, phone")
        .order("name")
        .limit(8);

      // Kun sifre/telefontegn (mellomrom, +, -, parenteser) ⇒ tolk som
      // nummer-søk: match telefon (format-uavhengig) ELLER org.nr. Ellers
      // søk på navn.
      const digits = trimmed.replace(/\D/g, "");
      const isNumberSearch = digits.length > 0 && /^[\d\s+()./-]+$/.test(trimmed);
      query = isNumberSearch
        ? query.or(`phone_digits.ilike.*${digits}*,org_number.ilike.${digits}*`)
        : query.ilike("name", `%${trimmed}%`);
      const { data } = await query;
      if (!alive) return;
      setHits(dedupeCustomers((data as Hit[]) ?? []));
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
      setActive((i) => Math.min(i + 1, hits.length + (updatesMatch ? 1 : 0) - 1));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (updatesMatch && active === 0) {
        setOpen(false);
        router.push("/oppdateringer");
      } else if (active >= 0 && hits[active - (updatesMatch ? 1 : 0)]) {
        goToCustomer(hits[active - (updatesMatch ? 1 : 0)].id);
      }
      else goToList();
    }
  }

  return (
    <header className="sticky top-0 z-30 hidden items-center gap-4 border-b border-[#d8c9b0] bg-[#fffaf0]/82 px-6 py-3 shadow-[0_16px_50px_rgba(61,44,24,0.06)] backdrop-blur-xl lg:flex">
      <div className="min-w-0">
        <p className="truncate text-sm text-[#6b6660]">
          {firstName ? (
            <>
              Velkommen tilbake,{" "}
              <span className="font-semibold text-[#2b2118]">{firstName}</span>
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
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8d806e]"
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
          placeholder="Søk etter kunde eller side …"
          className="w-full rounded-2xl border border-[#d8c9b0] bg-[#fbf7ed] py-2.5 pl-10 pr-4 text-sm text-[#2b2118] placeholder:text-[#8d806e] transition focus:border-[#09fe94]/70 focus:bg-[#fffaf0] focus:outline-none focus:ring-2 focus:ring-[#09fe94]/15"
        />

        {open && q.trim() && (
          <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-[#d8c9b0] bg-[#fffaf0] shadow-pop">
            {loading && hits.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-400">Søker …</p>
            )}
            {updatesMatch && (
              <button
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  router.push("/oppdateringer");
                }}
                onMouseEnter={() => setActive(0)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${active === 0 ? "bg-[#eafff5]" : "hover:bg-[#fbf7ed]"}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#171717] text-[#09fe94]">
                  <Icon name="clock" size={16} />
                </span>
                <span>
                  <span className="block text-sm font-bold text-[#2b2118]">Oppdateringer</span>
                  <span className="block text-xs text-[#8d806e]">Se hva som er nytt i Reachr</span>
                </span>
              </button>
            )}
            {!loading && hits.length === 0 && !updatesMatch && (
              <p className="px-4 py-3 text-sm text-slate-400">
                Ingen kunder matcher «{q.trim()}».
              </p>
            )}
            {hits.map((h, i) => (
              <button
                key={h.id}
                onClick={() => goToCustomer(h.id)}
                onMouseEnter={() => setActive(i + (updatesMatch ? 1 : 0))}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                  i + (updatesMatch ? 1 : 0) === active ? "bg-[#eafff5]" : "hover:bg-[#fbf7ed]"
                }`}
              >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#09fe94] text-xs font-bold text-[#171717]">
                  {h.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {h.name}
                  </span>
                  <span className="block truncate text-xs text-slate-400">
                    {[
                      h.phone ? `📞 ${h.phone}` : null,
                      h.org_number ? `Org.nr ${formatOrgNumber(h.org_number)}` : null,
                      h.city || null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </span>
              </button>
            ))}
            <Link
              href={`/customers?q=${encodeURIComponent(q.trim())}`}
              onClick={() => setOpen(false)}
              className="block border-t border-[#d8c9b0] px-4 py-2.5 text-sm font-bold text-[#008f52] hover:bg-[#fbf7ed]"
            >
              Se alle treff for «{q.trim()}» →
            </Link>
          </div>
        )}
      </div>

      {profile?.id && <NotificationBell userId={profile.id} />}

      <div className="flex items-center gap-3 border-l border-[#d8c9b0] pl-4">
        <Avatar
          name={profile?.full_name || profile?.email || "?"}
          url={profile?.avatar_url}
          size={36}
        />
        <div className="hidden leading-tight lg:block">
          <p className="text-sm font-semibold text-[#2b2118]">
            {profile?.full_name || "—"}
          </p>
          <p className="text-xs text-[#6b6660]">
            {profile?.role === "manager" ? "Salgssjef" : "Selger"}
          </p>
        </div>
      </div>
    </header>
  );
}
