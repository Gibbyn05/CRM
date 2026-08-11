"use client";

import { useEffect, useMemo, useState } from "react";
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
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState<AgentStatus | null>(null);
  const [error, setError] = useState("");

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
    if (!userId || saving) return;
    const previous = status;
    setError("");
    setSaving(value);
    setStatus(value);

    const { error: rpcError } = await supabase.rpc("set_agent_status", {
      p_status: value,
    });

    if (rpcError) {
      setStatus(previous);
      setError("Statusen ble ikke lagret. Prøv igjen.");
    }
    setSaving(null);
  }

  return (
    <div className="sticky bottom-0 z-40 shrink-0 border-t border-slate-200 bg-white/90 px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-3 sm:py-2.5">
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-1">
        {error && (
          <p className="text-xs font-medium text-red-600" role="alert">
            {error}
          </p>
        )}
        <div className="flex w-full items-center justify-center gap-2">
          <span className="hidden text-xs font-medium text-slate-400 sm:inline">
            Min status
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-2xl bg-slate-100 p-1 sm:flex-none sm:gap-1.5">
            {OPTIONS.map((o) => {
              const isActive = status === o.value;
              return (
                <button
                  key={o.value}
                  onClick={() => choose(o.value)}
                  aria-pressed={isActive}
                  disabled={saving !== null}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium transition sm:flex-none sm:gap-2 sm:px-3 sm:text-sm ${
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
    </div>
  );
}
