"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentState, LiveAgentRow } from "@/lib/types";
import AgentCard from "./AgentCard";

// Live agent-status tavle. Abonnerer på Supabase Realtime for agent_states og
// oppdaterer uten refresh. Brukes av det innloggede /live-dashboardet.
//
// Sorteringsrekkefølge: i samtale først, deretter ledig, ikke i samtale,
// frakoblet — slik at salgssjefen umiddelbart ser hvem som er aktive.
const STATUS_ORDER: Record<string, number> = {
  in_call: 0,
  available: 1,
  not_in_call: 2,
  offline: 3,
};

export default function LiveBoard({
  initialAgents,
}: {
  initialAgents: LiveAgentRow[];
}) {
  const supabase = createClient();
  const [agents, setAgents] = useState<LiveAgentRow[]>(initialAgents);

  useEffect(() => {
    // Realtime-abonnement på status-endringer.
    const channel = supabase
      .channel("agent_states_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_states" },
        (payload) => {
          const next = payload.new as AgentState;
          if (!next?.agent_id) return;
          setAgents((prev) =>
            prev.map((a) =>
              a.agent_id === next.agent_id
                ? {
                    ...a,
                    status: next.status,
                    last_call_started_at: next.last_call_started_at,
                    last_call_ended_at: next.last_call_ended_at,
                    status_changed_at: next.status_changed_at,
                  }
                : a,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const sorted = useMemo(
    () =>
      [...agents].sort((a, b) => {
        const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (s !== 0) return s;
        return a.full_name.localeCompare(b.full_name, "nb");
      }),
    [agents],
  );

  const counts = useMemo(() => {
    const c = { in_call: 0, available: 0, not_in_call: 0, offline: 0 };
    for (const a of agents) c[a.status]++;
    return c;
  }, [agents]);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="I samtale" value={counts.in_call} color="text-status-incall" />
        <StatBox label="Ledig" value={counts.available} color="text-status-idle" />
        <StatBox
          label="Ikke i samtale"
          value={counts.not_in_call}
          color="text-status-notincall"
        />
        <StatBox label="Frakoblet" value={counts.offline} color="text-status-offline" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((a) => (
          <AgentCard key={a.agent_id} agent={a} />
        ))}
        {sorted.length === 0 && (
          <p className="text-slate-500">Ingen agenter registrert ennå.</p>
        )}
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
