"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentState, AgentStatus } from "@/lib/types";

// Fast bunnlinje med tre statusknapper. Én er alltid aktiv (nåværende status).
// Reflekterer og setter innlogget brukers egen status (agent_states), og holdes
// synkronisert via Supabase Realtime (f.eks. når telefoni setter "i samtale").
const OPTIONS: { value: AgentStatus; label: string; active: string }[] = [
  { value: "in_call", label: "I samtale", active: "bg-status-incall text-white" },
  {
    value: "not_in_call",
    label: "Ikke i samtale",
    active: "bg-status-notincall text-white",
  },
  { value: "offline", label: "Frakoblet", active: "bg-status-offline text-white" },
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
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur md:left-60">
      <div className="mx-auto flex max-w-xl items-center justify-center gap-2">
        <span className="hidden text-xs text-slate-400 sm:inline">
          Min status:
        </span>
        {OPTIONS.map((o) => {
          const isActive = status === o.value;
          return (
            <button
              key={o.value}
              onClick={() => choose(o.value)}
              aria-pressed={isActive}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none ${
                isActive
                  ? o.active
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
