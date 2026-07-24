"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TeamChat from "./TeamChat";
import type { AuthorMap } from "@/lib/chat-types";
import type { Message } from "@/lib/types";

// Flytende chat-boble nederst i høyre hjørne. Klikk åpner en liten pop-up med
// team-chatten. Viser et rødt uleste-merke når nye meldinger kommer mens bobla
// er lukket.
export default function ChatWidget({ authors }: { authors: AuthorMap }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // Refs så lytteren alltid leser ferskeste verdier uten å re-abonnere.
  const openRef = useRef(open);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(0); // åpne = alt lest
  }, [open]);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => (userIdRef.current = data.user?.id ?? null));

    // Lett lytter som teller uleste team-meldinger mens bobla er lukket.
    const channel = supabase
      .channel("chat_widget_unread")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "channel=eq.team",
        },
        (payload) => {
          const m = payload.new as Message;
          if (openRef.current) return; // åpen → allerede synlig
          if (m.author_id && m.author_id === userIdRef.current) return; // egne teller ikke
          setUnread((u) => u + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <>
      {/* Pop-up-panel (ligger over statuslinja nederst) */}
      {open && (
        <div className="fixed bottom-40 right-4 z-50 flex w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 sm:right-6">
          <div className="flex items-center justify-between bg-brand-600 px-4 py-3 text-white">
            <span className="font-semibold">Team-chat</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Lukk chat"
              className="rounded p-1 text-slate-300 hover:bg-brand-700 hover:text-white"
            >
              ✕
            </button>
          </div>
          <TeamChat authors={authors} heightClass="h-[55vh]" embedded />
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
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-2xl text-white shadow-lg transition hover:scale-105 hover:bg-brand-700 sm:right-6"
      >
        {open ? "✕" : "💬"}

        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
