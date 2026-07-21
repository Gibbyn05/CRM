"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentStatus } from "@/lib/types";

// Lar den innloggede agenten manuelt sette Ledig / Ikke i samtale.
// "I samtale" styres av telefoni-hendelser, ikke manuelt.
const OPTIONS: { value: AgentStatus; label: string }[] = [
  { value: "available", label: "Ledig" },
  { value: "not_in_call", label: "Ikke i samtale" },
  { value: "offline", label: "Frakoblet" },
];

export default function AgentStatusToggle() {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  async function setStatus(status: AgentStatus) {
    setSaving(true);
    await supabase.rpc("set_agent_status", { p_status: status });
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">Min status:</span>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          disabled={saving}
          onClick={() => setStatus(o.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
