"use client";

import { useMemo, useState } from "react";
import type { UserRole } from "@/lib/types";
import Avatar from "./Avatar";
import Icon from "./Icon";
import DirectChat from "./DirectChat";

export interface TeamMember {
  id: string;
  name: string;
  avatar_url: string | null;
  role: UserRole;
}

// Team-katalog med direktemeldinger. Venstre: alle kolleger. Høyre: valgt
// samtale. På mobil vises listen først, deretter samtalen med en tilbake-knapp.
export default function TeamDirectory({
  me,
  members,
}: {
  me: { id: string; name: string; avatar_url: string | null };
  members: TeamMember[];
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? members.filter((m) => m.name.toLowerCase().includes(q))
      : members;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "nb"));
  }, [members, query]);

  const selected = members.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="card grid min-h-[72vh] grid-cols-1 overflow-hidden md:grid-cols-3">
      {/* Medlemsliste */}
      <aside
        className={`flex flex-col border-slate-200 md:col-span-1 md:border-r ${
          selected ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="border-b border-slate-100 p-3">
          <div className="relative">
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Søk i teamet …"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll">
          {filtered.map((m) => {
            const active = m.id === selectedId;
            return (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition ${
                  active ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                <Avatar name={m.name} url={m.avatar_url} size={40} />
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm font-semibold ${
                      active ? "text-brand-700" : "text-slate-800"
                    }`}
                  >
                    {m.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {m.role === "manager" ? "Salgssjef" : "Selger"}
                  </p>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Ingen kolleger funnet.
            </p>
          )}
        </div>
      </aside>

      {/* Samtale */}
      <section
        className={`flex-col md:col-span-2 md:flex ${
          selected ? "flex" : "hidden md:flex"
        }`}
      >
        {selected ? (
          <>
            {/* Samtale-header */}
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Tilbake"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
              >
                <Icon name="chevron-left" size={18} />
              </button>
              <Avatar name={selected.name} url={selected.avatar_url} size={38} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {selected.name}
                </p>
                <p className="text-xs text-slate-400">
                  {selected.role === "manager" ? "Salgssjef" : "Selger"}
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <DirectChat
                me={{ id: me.id, name: me.name, avatar_url: me.avatar_url }}
                peer={{
                  id: selected.id,
                  name: selected.name,
                  avatar_url: selected.avatar_url,
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
              <Icon name="chat" size={26} />
            </span>
            <p className="font-medium text-slate-600">Velg en kollega</p>
            <p className="max-w-xs text-sm text-slate-400">
              Klikk på et teammedlem til venstre for å starte en direktesamtale.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
