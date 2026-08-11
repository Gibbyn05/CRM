"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";
import type { AuthorMap } from "@/lib/chat-types";
import { formatTime } from "@/lib/format";
import Avatar from "./Avatar";

// Delt logg for team- og lederkanalen. Sanntid via Supabase Realtime.
// Viser profilbilde og navn på hvert innlegg.
export default function TeamChat({
  authors,
  heightClass = "h-[70vh]",
  embedded = false,
  channel = "team",
  customerId = null,
  placeholder = "Skriv en melding til teamet …",
  emptyText = "Ingen innlegg ennå. Start loggen.",
}: {
  authors: AuthorMap;
  // Lar chatten gjenbrukes både som full side og inne i chat-bobla.
  heightClass?: string;
  embedded?: boolean;
  channel?: "team" | "manager" | "customer_team" | "customer";
  customerId?: string | null;
  placeholder?: string;
  emptyText?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));

    setLoading(true);
    setError("");
    let query = supabase
      .from("messages")
      .select("*")
      .eq("channel", channel)
      .order("created_at", { ascending: true })
      .limit(200);
    query = customerId
      ? query.eq("customer_id", customerId)
      : query.is("customer_id", null);
    query
      .then(({ data, error: loadError }) => {
        if (loadError) setError("Kunne ikke hente loggen.");
        else setMessages((data as Message[]) ?? []);
        setLoading(false);
      });

    const realtimeChannel = supabase
      .channel(`${channel}_log_${customerId ?? "global"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel=eq.${channel}`,
        },
        (payload) => {
          const m = payload.new as Message;
          if ((m.customer_id ?? null) !== customerId) return;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [channel, customerId, supabase]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  async function send() {
    if (!body.trim() || !userId || sending) return;
    const text = body.trim();
    setSending(true);
    setError("");
    const { data, error: sendError } = await supabase
      .from("messages")
      .insert({
        author_id: userId,
        channel,
        customer_id: customerId,
        body: text,
      })
      .select("*")
      .single<Message>();

    if (sendError) {
      setError("Innlegget ble ikke lagret. Prøv igjen.");
    } else if (data) {
      setBody("");
      setMessages((prev) =>
        prev.some((message) => message.id === data.id) ? prev : [...prev, data],
      );
    }
    setSending(false);
  }

  function authorInfo(id: string | null) {
    if (id && authors[id]) return authors[id];
    return { name: "Ukjent", avatar_url: null };
  }

  return (
    <div
      className={`flex min-h-0 ${heightClass} flex-col ${
        embedded
          ? ""
          : "overflow-hidden rounded-[1.75rem] border border-[#d8c9b0] bg-[#fffaf0]/90 shadow-[0_22px_65px_rgba(62,45,27,0.09)]"
      }`}
    >
      <div
        ref={scrollRef}
        className="thin-scroll flex-1 space-y-4 overflow-y-auto p-4 sm:p-6"
      >
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
                    mine
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {m.body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {!loading && messages.length === 0 && (
          <div className="flex h-full min-h-56 items-center justify-center text-center">
            <div>
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#d8c9b0] bg-white text-xl text-[#087a4b]">
                ✎
              </span>
              <p className="mt-4 text-sm font-semibold text-[#756d64]">
                {emptyText}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[#e1d6c5] bg-white/80 p-3 sm:p-4">
        {error && (
          <p role="alert" className="mb-2 text-xs font-semibold text-red-600">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={placeholder}
            aria-label={placeholder}
            className="max-h-32 min-h-12 w-full resize-none rounded-xl border border-[#d8c9b0] bg-[#fffdf8] px-4 py-3 text-sm text-[#2b2118] outline-none transition placeholder:text-[#a49c92] focus:border-[#00a965] focus:ring-2 focus:ring-[#00a965]/15"
          />
          <button
            type="button"
            onClick={send}
            disabled={!body.trim() || sending}
            className="rounded-xl bg-[#171717] px-5 py-2 text-sm font-bold text-[#fffaf0] transition hover:bg-[#087a4b] disabled:cursor-not-allowed disabled:opacity-35"
          >
            {sending ? "Lagrer …" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
