"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentState, LiveAgentRow } from "@/lib/types";
import AgentCard from "./AgentCard";
import Icon, { type IconName } from "./Icon";

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
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatBox
          label="I samtale"
          value={counts.in_call}
          icon="phone"
          tint="bg-red-50 text-status-incall"
          pulse
        />
        <StatBox
          label="Ledig"
          value={counts.available}
          icon="check"
          tint="bg-emerald-50 text-status-idle"
        />
        <StatBox
          label="Ikke i samtale"
          value={counts.not_in_call}
          icon="phone-off"
          tint="bg-amber-50 text-status-notincall"
        />
        <StatBox
          label="Frakoblet"
          value={counts.offline}
          icon="power"
          tint="bg-slate-100 text-slate-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((a) => (
          <AgentCard key={a.agent_id} agent={a} />
        ))}
        {sorted.length === 0 && (
          <div className="card col-span-full p-10 text-center text-sm text-slate-500">
            Ingen agenter registrert ennå.
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  icon,
  tint,
  pulse = false,
}: {
  label: string;
  value: number;
  icon: IconName;
  tint: string;
  pulse?: boolean;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint} ${
          pulse && value > 0 ? "animate-pulse" : ""
        }`}
      >
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-slate-900">{value}</p>
        <p className="mt-1 truncate text-xs font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}
