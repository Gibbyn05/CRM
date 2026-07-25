"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CallTranscript } from "@/lib/types";
import { formatTime } from "@/lib/format";
import Icon from "./Icon";

const SPEAKER_LABEL: Record<string, string> = {
  agent: "Selger",
  customer: "Kunde",
  system: "System",
};

// Live sanntids-transkript for en kunde. Fylles av ICE-integrasjonen via
// /api/telephony/transcript og oppdateres uten refresh via Supabase Realtime.
export default function LiveTranscript({ customerId }: { customerId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<CallTranscript[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function summarize() {
    setSummarizing(true);
    setNote(null);
    try {
      const res = await fetch("/api/calls/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: customerId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Kunne ikke lage sammendrag.");
      setNote({ ok: true, text: "Sammendrag lagt til i loggen." });
      router.refresh();
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Ukjent feil." });
    } finally {
      setSummarizing(false);
    }
  }

  useEffect(() => {
    supabase
      .from("call_transcripts")
      .select("*")
      .eq("customer_id", customerId)
      .order("spoken_at", { ascending: true })
      .limit(200)
      .then(({ data }) => setRows((data as CallTranscript[]) ?? []));

    const channel = supabase
      .channel(`transcript_${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_transcripts",
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          const t = payload.new as CallTranscript;
          setRows((prev) =>
            prev.some((x) => x.id === t.id) ? prev : [...prev, t],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, customerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rows]);

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Icon name="mic" size={18} className="text-brand-600" />
          Live transkript
        </h2>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Sanntid
          </span>
          <button
            type="button"
            onClick={summarize}
            disabled={summarizing || rows.length === 0}
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
          >
            {summarizing ? "Oppsummerer …" : "Oppsummer med AI"}
          </button>
        </div>
      </div>

      {note && (
        <p
          className={`mb-2 text-xs ${
            note.ok ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {note.text}
        </p>
      )}

      <div className="max-h-72 space-y-2 overflow-y-auto thin-scroll">
        {rows.map((t) => (
          <div key={t.id} className="text-sm">
            <span
              className={`mr-2 text-xs font-semibold ${
                t.speaker === "agent"
                  ? "text-brand-600"
                  : t.speaker === "customer"
                    ? "text-slate-700"
                    : "text-slate-400"
              }`}
            >
              {SPEAKER_LABEL[t.speaker] ?? "—"}
            </span>
            <span className="text-[10px] text-slate-400">{formatTime(t.spoken_at)}</span>
            <p className={`text-slate-700 ${t.is_final ? "" : "italic opacity-70"}`}>
              {t.text}
            </p>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            Ingen transkript ennå. Teksten fra samtalene dukker opp her i sanntid
            mens du snakker (via ICE-integrasjonen).
          </p>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
