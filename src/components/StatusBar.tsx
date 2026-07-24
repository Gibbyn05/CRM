"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentState, AgentStatus } from "@/lib/types";
import Icon, { type IconName } from "./Icon";

// Fast bunnlinje med tre statusknapper. Én er alltid aktiv (nåværende status).
// Reflekterer og setter innlogget brukers egen status (agent_states), og holdes
// synkronisert via Supabase Realtime (f.eks. når telefoni setter "i samtale").
const OPTIONS: {
  value: AgentStatus;
  label: string;
  icon: IconName;
  active: string;
}[] = [
  {
    value: "in_call",
    label: "I samtale",
    icon: "phone",
    active: "bg-status-incall text-white shadow-sm",
  },
  {
    value: "not_in_call",
    label: "Ikke i samtale",
    icon: "phone-off",
    active: "bg-status-notincall text-white shadow-sm",
  },
  {
    value: "offline",
    label: "Frakoblet",
    icon: "power",
    active: "bg-slate-700 text-white shadow-sm",
  },
];

export default function StatusBar() {
  const supabase = createClient();
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from("agent_states")
        .select("status")
        .eq("agent_id", user.id)
        .maybeSingle();
      setStatus((data?.status as AgentStatus) ?? "offline");

      // Hold i synk med endringer (også fra telefoni-hendelser).
      channel = supabase
        .channel(`my_status_${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "agent_states",
            filter: `agent_id=eq.${user.id}`,
          },
          (payload) => {
            const next = payload.new as AgentState;
            if (next?.status) setStatus(next.status);
          },
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function choose(value: AgentStatus) {
    if (!userId) return;
    setStatus(value); // optimistisk
    await supabase.rpc("set_agent_status", { p_status: value });
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/90 px-3 py-2.5 backdrop-blur md:left-64">
      <div className="mx-auto flex max-w-2xl items-center justify-center gap-2">
        <span className="hidden text-xs font-medium text-slate-400 sm:inline">
          Min status
        </span>
        <div className="flex flex-1 items-center gap-1.5 rounded-2xl bg-slate-100 p-1 sm:flex-none">
          {OPTIONS.map((o) => {
            const isActive = status === o.value;
            return (
              <button
                key={o.value}
                onClick={() => choose(o.value)}
                aria-pressed={isActive}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition sm:flex-none ${
                  isActive
                    ? o.active
                    : "text-slate-500 hover:bg-white hover:text-slate-700"
                }`}
              >
                <Icon name={o.icon} size={16} />
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
