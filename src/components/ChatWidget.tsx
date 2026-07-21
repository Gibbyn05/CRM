"use client";

import { useState } from "react";
import TeamChat from "./TeamChat";
import type { AuthorMap } from "@/lib/chat-types";

// Flytende chat-boble nederst i høyre hjørne. Klikk åpner en liten pop-up med
// team-chatten. Vises på alle innloggede sider (montert i dashboard-layouten).
export default function ChatWidget({ authors }: { authors: AuthorMap }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Pop-up-panel (ligger over statuslinja nederst) */}
      {open && (
        <div className="fixed bottom-40 right-4 z-50 flex w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 sm:right-6">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
            <span className="font-semibold">Team-chat</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Lukk chat"
              className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              ✕
            </button>
          </div>
          <TeamChat authors={authors} heightClass="h-[55vh]" embedded />
        </div>
      )}

      {/* Boble-knapp (løftet over statuslinja) */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Lukk chat" : "Åpne chat"}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-2xl text-white shadow-lg transition hover:scale-105 hover:bg-slate-800 sm:right-6"
      >
        {open ? "✕" : "💬"}
      </button>
    </>
  );
}
