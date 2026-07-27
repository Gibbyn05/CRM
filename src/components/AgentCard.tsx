"use client";

import { forwardRef, useEffect, useState } from "react";
import type { LiveAgentRow } from "@/lib/types";
import { AGENT_STATUS_COLORS, AGENT_STATUS_LABELS } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import Avatar from "./Avatar";

// Ett agent-kort på live-tavla. `big`-varianten brukes på storskjerm/TV.
// Videresender ref til rot-elementet slik at TvBoard kan FLIP-reposisjonere
// kortet jevnt når statusendringer omsorterer lista.
const AgentCard = forwardRef<
  HTMLDivElement,
  { agent: LiveAgentRow; big?: boolean }
>(function AgentCard({ agent, big = false }, ref) {
  // Tikker hvert 20. sekund slik at "hvor lenge siden" holdes ferskt uten
  // ny data fra serveren.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, []);

  const color = AGENT_STATUS_COLORS[agent.status];
  const label = AGENT_STATUS_LABELS[agent.status];
  const isInCall = agent.status === "in_call";

  const lastCall = agent.last_call_ended_at ?? agent.last_call_started_at;

  return (
    <div
      ref={ref}
      className={`card animate-card-in flex items-center justify-between gap-3 transition hover:shadow-pop ${
        big ? "p-6" : "p-4"
      } ${isInCall ? "border-2 border-status-incall shadow-pop" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          <Avatar name={agent.full_name || "Ukjent"} size={big ? 52 : 42} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 rounded-full transition-colors duration-300 ${color} ring-2 ring-white ${
              big ? "h-4 w-4" : "h-3.5 w-3.5"
            } ${agent.status === "in_call" ? "animate-pulse" : ""}`}
          />
        </div>
        <div className="min-w-0">
          <p
            className={`truncate font-semibold text-slate-900 ${
              big ? "text-2xl" : "text-[15px]"
            }`}
          >
            {agent.full_name || "Ukjent"}
          </p>
          <p className={`truncate text-slate-500 ${big ? "text-lg" : "text-sm"}`}>
            {agent.status === "in_call"
              ? `I samtale siden ${timeAgo(agent.status_changed_at)}`
              : `Sist ringte ${timeAgo(lastCall)}`}
          </p>
        </div>
      </div>

      <span
        className={`shrink-0 rounded-full px-3 py-1 font-semibold text-white transition-colors duration-300 ${color} ${
          big ? "text-lg" : "text-xs"
        }`}
      >
        {label}
      </span>
    </div>
  );
});

export default AgentCard;
