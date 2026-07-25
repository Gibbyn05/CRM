"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Reminder } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import Icon from "./Icon";

interface AgentOption {
  id: string;
  name: string;
}

// Oppfølging/påminnelser. Selger ser egne; leder ser og kan tildele til andre.
// Grupperes i Forfalt / I dag / Kommende / Fullført. Sanntid via Realtime.
export default function RemindersView({
  userId,
  isManager,
  agents,
}: {
  userId: string;
  isManager: boolean;
  agents: AgentOption[];
}) {
  const supabase = createClient();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(userId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("reminders")
      .select("*")
      .order("due_at", { ascending: true });
    setReminders((data as Reminder[]) ?? []);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("reminders_view")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function create() {
    setError(null);
    if (!title.trim() || !due) {
      setError("Tittel og tidspunkt er påkrevd.");
      return;
    }
    setSaving(true);
    const { error: insErr } = await supabase.from("reminders").insert({
      agent_id: isManager ? assignee : userId,
      created_by: userId,
      title: title.trim(),
      note: note.trim() || null,
      due_at: new Date(due).toISOString(),
    });
    setSaving(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setTitle("");
    setDue("");
    setNote("");
    load();
  }

  async function toggleDone(r: Reminder) {
    setReminders((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, done: !x.done } : x)),
    );
    await supabase
      .from("reminders")
      .update({ done: !r.done, done_at: !r.done ? new Date().toISOString() : null })
      .eq("id", r.id);
  }

  async function remove(r: Reminder) {
    setReminders((prev) => prev.filter((x) => x.id !== r.id));
    await supabase.from("reminders").delete().eq("id", r.id);
  }

  const groups = useMemo(() => {
    const now = Date.now();
    const endToday = new Date();
    endToday.setHours(23, 59, 59, 999);
    const g = {
      overdue: [] as Reminder[],
      today: [] as Reminder[],
      upcoming: [] as Reminder[],
      done: [] as Reminder[],
    };
    for (const r of reminders) {
      if (r.done) g.done.push(r);
      else if (new Date(r.due_at).getTime() < now) g.overdue.push(r);
      else if (new Date(r.due_at).getTime() <= endToday.getTime()) g.today.push(r);
      else g.upcoming.push(r);
    }
    return g;
  }, [reminders]);

  const agentName = (id: string) =>
    agents.find((a) => a.id === id)?.name ?? "Ukjent";

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Ny påminnelse */}
      <div className="card h-fit p-5 lg:col-span-1">
        <h2 className="mb-3 font-semibold text-slate-900">Ny påminnelse</h2>
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="F.eks. Ring Oslo Bil tilbake"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Notat (valgfritt)"
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {isManager && (
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id === userId ? "Meg" : a.name}
                </option>
              ))}
            </select>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={create}
            disabled={saving}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Lagrer …" : "Legg til påminnelse"}
          </button>
        </div>
      </div>

      {/* Liste */}
      <div className="space-y-5 lg:col-span-2">
        <Group
          title="Forfalt"
          tone="text-red-600"
          items={groups.overdue}
          {...{ toggleDone, remove, isManager, agentName }}
        />
        <Group
          title="I dag"
          tone="text-amber-600"
          items={groups.today}
          {...{ toggleDone, remove, isManager, agentName }}
        />
        <Group
          title="Kommende"
          tone="text-slate-600"
          items={groups.upcoming}
          {...{ toggleDone, remove, isManager, agentName }}
        />
        <Group
          title="Fullført"
          tone="text-emerald-600"
          items={groups.done}
          {...{ toggleDone, remove, isManager, agentName }}
        />
        {reminders.length === 0 && (
          <div className="card p-10 text-center text-sm text-slate-500">
            Ingen påminnelser ennå.
          </div>
        )}
      </div>
    </div>
  );
}

function Group({
  title,
  tone,
  items,
  toggleDone,
  remove,
  isManager,
  agentName,
}: {
  title: string;
  tone: string;
  items: Reminder[];
  toggleDone: (r: Reminder) => void;
  remove: (r: Reminder) => void;
  isManager: boolean;
  agentName: (id: string) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={`mb-2 text-xs font-semibold uppercase tracking-wider ${tone}`}>
        {title} · {items.length}
      </p>
      <div className="card divide-y divide-slate-100">
        {items.map((r) => (
          <div key={r.id} className="flex items-start gap-3 p-4">
            <button
              onClick={() => toggleDone(r)}
              aria-label={r.done ? "Merk som ikke fullført" : "Merk som fullført"}
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                r.done
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-slate-300 hover:border-brand-400"
              }`}
            >
              {r.done && <Icon name="check" size={13} />}
            </button>
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  r.done ? "text-slate-400 line-through" : "text-slate-800"
                }`}
              >
                {r.title}
              </p>
              {r.note && <p className="text-xs text-slate-500">{r.note}</p>}
              <p className="mt-0.5 text-xs text-slate-400">
                {formatDateTime(r.due_at)}
                {isManager && ` · ${agentName(r.agent_id)}`}
              </p>
            </div>
            <button
              onClick={() => remove(r)}
              aria-label="Slett"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
