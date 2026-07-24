"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";
import { formatTime } from "@/lib/format";

// Kommentarer/chat knyttet til en spesifikk kunde-case (channel = 'customer').
// Ansatte kan diskutere kunden i sanntid.
export default function CaseChat({
  customerId,
  nameMap,
}: {
  customerId: string;
  nameMap: Record<string, string>;
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
      .eq("channel", "customer")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data as Message[]) ?? []));

    const channel = supabase
      .channel(`case_chat_${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          if (m.channel !== "customer") return;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!body.trim() || !userId) return;
    const text = body.trim();
    setBody("");
    await supabase.from("messages").insert({
      author_id: userId,
      channel: "customer",
      customer_id: customerId,
      body: text,
    });
  }

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-lg font-bold text-slate-900">Kommentarer</h2>

      <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="font-medium text-slate-700">
              {m.author_id ? nameMap[m.author_id] ?? "Ukjent" : "System"}
            </span>{" "}
            <span className="text-xs text-slate-400">{formatTime(m.created_at)}</span>
            <p className="text-slate-700">{m.body}</p>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">Ingen kommentarer ennå.</p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Skriv en kommentar …"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          onClick={send}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Send
        </button>
      </div>
    </div>
  );
}
