"use client";

import { useEffect, useRef, useState } from "react";
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
  const [rows, setRows] = useState<CallTranscript[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Icon name="mic" size={18} className="text-brand-600" />
          Live transkript
        </h2>
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Sanntid
        </span>
      </div>

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
