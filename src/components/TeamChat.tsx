"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message, MessageChannel } from "@/lib/types";
import type { AuthorMap } from "@/lib/chat-types";
import { formatTime } from "@/lib/format";
import Avatar from "./Avatar";

// Delt chat-komponent for kanaler uten mottaker (i dag: 'team' og
// 'leadership'). Sanntid via Supabase Realtime. Viser profilbilde + navn på
// hver melding.
export default function TeamChat({
  authors,
  channel: messageChannel = "team",
  heightClass = "h-[70vh]",
  embedded = false,
  emptyText = "Ingen meldinger ennå. Start samtalen!",
}: {
  authors: AuthorMap;
  // Hvilken messages.channel som leses/skrives til.
  channel?: Extract<MessageChannel, "team" | "leadership">;
  // Lar chatten gjenbrukes både som full side og inne i chat-bobla.
  heightClass?: string;
  embedded?: boolean;
  emptyText?: string;
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
      .eq("channel", messageChannel)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => setMessages((data as Message[]) ?? []));

    const channel = supabase
      .channel(`${messageChannel}_chat`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel=eq.${messageChannel}`,
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
  }, [supabase, messageChannel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!body.trim() || !userId) return;
    const text = body.trim();
    setBody("");
    await supabase.from("messages").insert({
      author_id: userId,
      channel: messageChannel,
      body: text,
    });
  }

  function authorInfo(id: string | null) {
    if (id && authors[id]) return authors[id];
    return { name: "Ukjent", avatar_url: null };
  }

  return (
    <div
      className={`flex ${heightClass} flex-col ${
        embedded ? "" : "card"
      }`}
    >
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => {
          const mine = m.author_id === userId;
          const a = authorInfo(m.author_id);
          return (
            <div
              key={m.id}
              className={`flex items-end gap-2 ${
                mine ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <Avatar name={a.name} url={a.avatar_url} size={32} />
              <div
                className={`flex max-w-[75%] flex-col ${
                  mine ? "items-end" : "items-start"
                }`}
              >
                <div className="mb-0.5 flex items-center gap-2 px-1">
                  <span className="text-xs font-medium text-slate-600">
                    {mine ? "Deg" : a.name}
                  </span>
                  <span className="text-3xs text-slate-400">
                    {formatTime(m.created_at)}
                  </span>
                </div>
                <div
                  className={`rounded-2xl px-4 py-2 ${
                    mine ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                </div>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-400">{emptyText}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-slate-200 p-3">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Skriv en melding …"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          onClick={send}
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Send
        </button>
      </div>
    </div>
  );
}
