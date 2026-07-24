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
    <div className="card p-5">
      <h2 className="mb-3 text-lg font-bold text-slate-900">Logg</h2>

      <div className="mb-4 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Skriv notat fra samtale/interaksjon …"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <div className="flex items-center gap-2">
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value as NoteType)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="call">Samtale</option>
            <option value="general">Notat</option>
            <option value="meeting">Møte</option>
          </select>
          <button
            onClick={addNote}
            disabled={saving || !body.trim()}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Lagre notat
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="border-l-2 border-slate-200 pl-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                {NOTE_TYPE_LABELS[n.note_type]}
              </span>
              <span>{formatDateTime(n.created_at)}</span>
              <span>·</span>
              <span>{n.author_id ? nameMap[n.author_id] ?? "Ukjent" : "System"}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
              {n.body}
            </p>
          </li>
        ))}
        {notes.length === 0 && (
          <li className="text-sm text-slate-400">Ingen loggføringer ennå.</li>
        )}
      </ul>
    </div>
  );
}
