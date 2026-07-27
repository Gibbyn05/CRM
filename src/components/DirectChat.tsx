"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";
import type { AuthorInfo } from "@/lib/chat-types";
import { formatTime } from "@/lib/format";
import Avatar from "./Avatar";

interface Person extends AuthorInfo {
  id: string;
}

// 1:1 direktemelding mellom innlogget bruker og en kollega (channel = 'direct').
// Sanntid via Supabase Realtime; RLS sørger for at kun de to partene ser tråden.
export default function DirectChat({ me, peer }: { me: Person; peer: Person }) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let activeMsgs = true;
    supabase
      .from("messages")
      .select("*")
      .eq("channel", "direct")
      .or(
        `and(author_id.eq.${me.id},recipient_id.eq.${peer.id}),and(author_id.eq.${peer.id},recipient_id.eq.${me.id})`,
      )
      .order("created_at", { ascending: true })
      .limit(300)
      .then(({ data }) => {
        if (activeMsgs) setMessages((data as Message[]) ?? []);
      });

    // Lytt på nye direktemeldinger og behold kun de som hører til denne tråden.
    const channel = supabase
      .channel(`direct_${[me.id, peer.id].sort().join("_")}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "channel=eq.direct",
        },
        (payload) => {
          const m = payload.new as Message;
          const inThread =
            (m.author_id === me.id && m.recipient_id === peer.id) ||
            (m.author_id === peer.id && m.recipient_id === me.id);
          if (!inThread) return;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .subscribe();

    return () => {
      activeMsgs = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, me.id, peer.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!body.trim()) return;
    const text = body.trim();
    setBody("");
    await supabase.from("messages").insert({
      author_id: me.id,
      channel: "direct",
      recipient_id: peer.id,
      body: text,
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4 thin-scroll">
        {messages.map((m) => {
          const mine = m.author_id === me.id;
          const person = mine ? me : peer;
          return (
            <div
              key={m.id}
              className={`flex items-end gap-2 ${
                mine ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <Avatar name={person.name} url={person.avatar_url} size={32} />
              <div
                className={`flex max-w-[75%] flex-col ${
                  mine ? "items-end" : "items-start"
                }`}
              >
                <div className="mb-0.5 flex items-center gap-2 px-1">
                  <span className="text-xs font-medium text-slate-600">
                    {mine ? "Deg" : person.name}
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
          <p className="pt-10 text-center text-sm text-slate-400">
            Ingen meldinger ennå. Si hei til {peer.name}!
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-slate-200 p-3">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Melding til ${peer.name} …`}
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
