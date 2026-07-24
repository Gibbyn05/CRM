"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TeamChat from "./TeamChat";
import DirectChat from "./DirectChat";
import Avatar from "./Avatar";
import Icon from "./Icon";
import type { AuthorMap } from "@/lib/chat-types";
import type { Message } from "@/lib/types";

// Flytende chat-boble nederst i høyre hjørne. Klikk åpner en pop-up med to
// faner: "Team" (felles chat) og "Privat" (direktemelding til én kollega).
// Viser et rødt uleste-merke når nye meldinger kommer mens bobla er lukket.
export default function ChatWidget({ authors }: { authors: AuthorMap }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<"team" | "direct">("team");
  const [peerId, setPeerId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Refs så lytteren alltid leser ferskeste verdier uten å re-abonnere.
  const openRef = useRef(open);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(0); // åpne = alt lest
  }, [open]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      userIdRef.current = data.user?.id ?? null;
      setUserId(data.user?.id ?? null);
    });

    // Teller uleste team-meldinger + private meldinger til meg mens bobla er
    // lukket.
    const channel = supabase
      .channel("chat_widget_unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Message;
          if (openRef.current) return; // åpen → allerede synlig
          const me = userIdRef.current;
          if (m.channel === "team" && m.author_id !== me) {
            setUnread((u) => u + 1);
          } else if (m.channel === "direct" && m.recipient_id === me) {
            setUnread((u) => u + 1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const members = useMemo(
    () =>
      Object.entries(authors)
        .filter(([id]) => id !== userId)
        .map(([id, a]) => ({ id, name: a.name, avatar_url: a.avatar_url }))
        .sort((a, b) => a.name.localeCompare(b.name, "nb")),
    [authors, userId],
  );

  const me = {
    id: userId ?? "",
    name: (userId && authors[userId]?.name) || "Deg",
    avatar_url: (userId && authors[userId]?.avatar_url) || null,
  };
  const peer = peerId
    ? {
        id: peerId,
        name: authors[peerId]?.name ?? "Ukjent",
        avatar_url: authors[peerId]?.avatar_url ?? null,
      }
    : null;

  return (
    <>
      {/* Pop-up-panel (ligger over statuslinja nederst) */}
      {open && (
        <div className="fixed bottom-40 right-4 z-50 flex w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-slate-200 sm:right-6">
          {/* Header med faner */}
          <div className="flex items-center justify-between bg-brand-600 px-3 py-2.5 text-white">
            <div className="flex gap-0.5 rounded-lg bg-white/15 p-0.5">
              <TabButton
                active={tab === "team"}
                onClick={() => setTab("team")}
                label="Team"
              />
              <TabButton
                active={tab === "direct"}
                onClick={() => setTab("direct")}
                label="Privat"
              />
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Lukk chat"
              className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {/* Team-fane */}
          {tab === "team" && (
            <TeamChat authors={authors} heightClass="h-[55vh]" embedded />
          )}

          {/* Privat-fane */}
          {tab === "direct" &&
            (peer && userId ? (
              <div className="flex h-[55vh] flex-col">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                  <button
                    onClick={() => setPeerId(null)}
                    aria-label="Tilbake"
                    className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                  >
                    <Icon name="chevron-left" size={18} />
                  </button>
                  <Avatar name={peer.name} url={peer.avatar_url} size={30} />
                  <span className="truncate text-sm font-semibold text-slate-800">
                    {peer.name}
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <DirectChat me={me} peer={peer} />
                </div>
              </div>
            ) : (
              <div className="h-[55vh] overflow-y-auto thin-scroll">
                <p className="px-4 pb-1 pt-3 text-xs font-medium text-slate-400">
                  Velg en kollega å sende privat melding til
                </p>
                {members.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPeerId(m.id)}
                    className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-2.5 text-left hover:bg-slate-50"
                  >
                    <Avatar name={m.name} url={m.avatar_url} size={34} />
                    <span className="truncate text-sm font-medium text-slate-800">
                      {m.name}
                    </span>
                  </button>
                ))}
                {members.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    Ingen andre kolleger ennå.
                  </p>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Boble-knapp (løftet over statuslinja) med uleste-merke */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={
          open
            ? "Lukk chat"
            : unread > 0
              ? `Åpne chat (${unread} uleste)`
              : "Åpne chat"
        }
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:scale-105 hover:bg-brand-700 sm:right-6"
      >
        {open ? <Icon name="close" size={24} /> : <Icon name="chat" size={24} />}

        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-sm font-medium transition ${
        active ? "bg-white text-brand-700" : "text-white/80 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
