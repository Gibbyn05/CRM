"use client";

import { useEffect, useState } from "react";
import type { LiveAgentRow } from "@/lib/types";
import { AGENT_STATUS_COLORS, AGENT_STATUS_LABELS } from "@/lib/constants";
import { timeAgo } from "@/lib/format";

// Ett agent-kort på live-tavla. `big`-varianten brukes på storskjerm/TV.
export default function AgentCard({
  agent,
  big = false,
}: {
  agent: LiveAgentRow;
  big?: boolean;
}) {
  // Tikker hvert 20. sekund slik at "hvor lenge siden" holdes ferskt uten
  // ny data fra serveren.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, []);

  const color = AGENT_STATUS_COLORS[agent.status];
  const label = AGENT_STATUS_LABELS[agent.status];

  const lastCall = agent.last_call_ended_at ?? agent.last_call_started_at;

  return (
    <div
      className={`flex items-center justify-between rounded-xl bg-white shadow-sm ${
        big ? "p-6" : "p-4"
      }`}
    >
      <div className="min-w-0">
        <p
          className={`truncate font-semibold text-slate-900 ${
            big ? "text-2xl" : "text-base"
          }`}
        >
          {agent.full_name || "Ukjent"}
        </p>
        <p className={`text-slate-500 ${big ? "text-lg" : "text-sm"}`}>
          {agent.status === "in_call"
            ? `I samtale siden ${timeAgo(agent.status_changed_at)}`
            : `Sist ringte ${timeAgo(lastCall)}`}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`inline-block rounded-full ${color} ${
            big ? "h-4 w-4" : "h-3 w-3"
          } ${agent.status === "in_call" ? "animate-pulse" : ""}`}
        />
        <span
          className={`rounded-full px-3 py-1 font-medium text-white ${color} ${
            big ? "text-lg" : "text-xs"
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
