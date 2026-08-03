"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Note, NoteType } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  call: "Samtale",
  general: "Notat",
  meeting: "Møte",
  system: "System",
};

// Kronologisk samtalelogg med tidsstempel og forfatter. Nye notater vises
// umiddelbart via Realtime.
export default function NotesLog({
  customerId,
  initialNotes,
  nameMap,
}: {
  customerId: string;
  initialNotes: Note[];
  nameMap: Record<string, string>;
}) {
  const supabase = createClient();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("call");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel(`notes_${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notes",
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          const n = payload.new as Note;
          setNotes((prev) =>
            prev.some((x) => x.id === n.id) ? prev : [n, ...prev],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId, supabase]);

  async function addNote() {
    if (!body.trim()) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("notes").insert({
      customer_id: customerId,
      author_id: user?.id ?? null,
      note_type: noteType,
      body: body.trim(),
    });
    setBody("");
    setSaving(false);
  }

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Logg</h2>
        <span className="text-xs font-medium text-slate-400">
          {notes.length} {notes.length === 1 ? "oppføring" : "oppføringer"}
        </span>
      </div>

      <div className="mb-6 space-y-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter lagrer raskt.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addNote();
          }}
          rows={7}
          placeholder="Skriv notat fra samtale/interaksjon … (Cmd/Ctrl+Enter for å lagre)"
          className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-[15px] leading-relaxed focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <div className="flex items-center gap-2">
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value as NoteType)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="call">Samtale</option>
            <option value="general">Notat</option>
            <option value="meeting">Møte</option>
          </select>
          <button
            onClick={addNote}
            disabled={saving || !body.trim()}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Lagre notat
          </button>
        </div>
      </div>

      <ul className="space-y-4">
        {notes.map((n) => (
          <li
            key={n.id}
            className="rounded-xl border border-slate-100 bg-slate-50/50 p-4"
          >
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="rounded bg-slate-200/70 px-1.5 py-0.5 font-medium text-slate-600">
                {NOTE_TYPE_LABELS[n.note_type]}
              </span>
              <span>{formatDateTime(n.created_at)}</span>
              <span>·</span>
              <span>{n.author_id ? nameMap[n.author_id] ?? "Ukjent" : "System"}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">
              {n.body}
            </p>
          </li>
        ))}
        {notes.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
            Ingen loggføringer ennå.
          </li>
        )}
      </ul>
    </div>
  );
}
