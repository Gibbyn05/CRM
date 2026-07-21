"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";
import { formatTime } from "@/lib/format";

// Intern team-chat (channel = 'team'). Sanntid via Supabase Realtime.
export default function TeamChat({
  nameMap,
  heightClass = "h-[70vh]",
  embedded = false,
}: {
  nameMap: Record<string, string>;
  // Lar chatten gjenbrukes både som full side og inne i chat-bobla.
  heightClass?: string;
  embedded?: boolean;
}) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));

    supabase
      .from("messages")
      .select("*")
      .eq("channel", "team")
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => setMessages((data as Message[]) ?? []));

    const channel = supabase
      .channel("team_chat")
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
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!body.trim() || !userId) return;
    const text = body.trim();
    setBody("");
    await supabase.from("messages").insert({
      author_id: userId,
      channel: "team",
      body: text,
    });
  }

  return (
    <div
      className={`flex ${heightClass} flex-col ${
        embedded ? "" : "rounded-xl bg-white shadow-sm"
      }`}
    >
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => {
          const mine = m.author_id === userId;
          return (
            <div
              key={m.id}
              className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  mine
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {!mine && (
                  <p className="mb-0.5 text-xs font-medium text-slate-500">
                    {m.author_id ? nameMap[m.author_id] ?? "Ukjent" : "System"}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              </div>
              <span className="mt-0.5 text-[10px] text-slate-400">
                {formatTime(m.created_at)}
              </span>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-400">
            Ingen meldinger ennå. Start samtalen!
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-slate-200 p-3">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Skriv en melding …"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          onClick={send}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Send
        </button>
      </div>
    </div>
  );
}
