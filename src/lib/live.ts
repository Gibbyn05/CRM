import type { AgentState, LiveAgentRow, Profile } from "./types";

// Hjelpefunksjon for live-tavla. Ligger i en vanlig (ikke "use client") modul
// slik at den kan brukes både fra server-komponenter (/live, /api/live-board)
// og klient-komponenter uten at Next gjør den om til en klient-referanse.
export function toLiveRows(
  profiles: Pick<Profile, "id" | "full_name">[],
  states: AgentState[],
): LiveAgentRow[] {
  const stateMap = new Map(states.map((s) => [s.agent_id, s]));
  return profiles.map((p) => {
    const s = stateMap.get(p.id);
    return {
      agent_id: p.id,
      full_name: p.full_name,
      status: s?.status ?? "offline",
      last_call_started_at: s?.last_call_started_at ?? null,
      last_call_ended_at: s?.last_call_ended_at ?? null,
      status_changed_at: s?.status_changed_at ?? new Date().toISOString(),
    };
  });
}
