"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveAgentRow } from "@/lib/types";
import AgentCard from "./AgentCard";

const STATUS_ORDER: Record<string, number> = {
  in_call: 0,
  available: 1,
  not_in_call: 2,
  offline: 3,
};

// TV-tavle med automatisk oppdatering (polling hvert 5. sekund). Designet for
// storskjerm: store kort, høy kontrast. Ingen innlogging.
export default function TvBoard() {
  const [agents, setAgents] = useState<LiveAgentRow[]>([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/live-board", { cache: "no-store" });
        const json = await res.json();
        if (active) setAgents(json.agents ?? []);
      } catch {
        // ignorer transiente feil; prøver igjen ved neste intervall
      }
    }

    load();
    const dataTimer = setInterval(load, 5_000);
    const clockTimer = setInterval(() => setNow(new Date()), 1_000);
    return () => {
      active = false;
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...agents].sort((a, b) => {
        const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (s !== 0) return s;
        return a.full_name.localeCompare(b.full_name, "nb");
      }),
    [agents],
  );

  const inCall = agents.filter((a) => a.status === "in_call").length;

  return (
    <div className="min-h-screen bg-slate-900 p-8 text-white">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Salgssentral – Live</h1>
          <p className="text-xl text-slate-400">
            {inCall} i samtale nå · {agents.length} agenter
          </p>
        </div>
        <div className="text-right">
          <p className="text-5xl font-bold tabular-nums">
            {now.toLocaleTimeString("nb-NO", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-lg text-slate-400">
            {now.toLocaleDateString("nb-NO", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((a) => (
          <AgentCard key={a.agent_id} agent={a} big />
        ))}
      </div>
    </div>
  );
}
