"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contract, Deal, Note, NoteType } from "@/lib/types";
import { formatCurrency, formatDateTime } from "@/lib/format";
import Icon, { type IconName } from "./Icon";

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  call: "Samtale",
  general: "Notat",
  meeting: "Møte",
  system: "System",
};

type Tone = "sale" | "loss" | "info";

interface TimelineItem {
  id: string;
  kind: "note" | "event";
  at: string;
  // note
  authorId?: string | null;
  noteType?: NoteType;
  // event
  icon?: IconName;
  tone?: Tone;
  text: string;
}

const TONE_STYLE: Record<Tone, { dot: string; text: string; bg: string }> = {
  sale: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  loss: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
  info: { dot: "bg-slate-400", text: "text-slate-600", bg: "bg-slate-100" },
};

// Loggen som en chat: manuelle notater + automatiske hendelser (tilbud sendt,
// akseptert, kontrakt signert …) vises som meldinger i en samtale, med
// skrivefeltet nederst.
export default function NotesLog({
  customerId,
  initialNotes,
  deals,
  contracts,
  nameMap,
}: {
  customerId: string;
  initialNotes: Note[];
  deals: Deal[];
  contracts: Contract[];
  nameMap: Record<string, string>;
}) {
  const supabase = createClient();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("call");
  const [saving, setSaving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
            prev.some((x) => x.id === n.id) ? prev : [...prev, n],
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId, supabase]);

  // Slå sammen notater + salg-/kontrakthendelser til én kronologisk strøm.
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    for (const n of notes) {
      items.push({
        id: `note-${n.id}`,
        kind: "note",
        at: n.created_at,
        authorId: n.author_id,
        noteType: n.note_type,
        text: n.body,
      });
    }

    for (const d of deals) {
      const amt = d.amount != null ? ` · ${formatCurrency(d.amount, d.currency)}` : "";
      if (d.created_at && !d.offer_sent_at) {
        items.push({
          id: `deal-new-${d.id}`,
          kind: "event",
          at: d.created_at,
          icon: "pipeline",
          tone: "info",
          text: `Nytt salg opprettet: ${d.title}${amt}`,
        });
      }
      if (d.offer_sent_at) {
        items.push({
          id: `deal-sent-${d.id}`,
          kind: "event",
          at: d.offer_sent_at,
          icon: "send",
          tone: "info",
          text: `Tilbud sendt: ${d.title}${amt}`,
        });
      }
      if (d.offer_accepted_at) {
        items.push({
          id: `deal-acc-${d.id}`,
          kind: "event",
          at: d.offer_accepted_at,
          icon: "check",
          tone: "sale",
          text: `Tilbud akseptert 🎉 ${d.title}${amt}`,
        });
      }
      if (d.stage === "tapt") {
        items.push({
          id: `deal-lost-${d.id}`,
          kind: "event",
          at: d.updated_at,
          icon: "close",
          tone: "loss",
          text: `Tilbud tapt: ${d.title}${d.lost_reason ? ` (${d.lost_reason})` : ""}`,
        });
      }
    }

    for (const c of contracts) {
      if (c.sent_at) {
        items.push({
          id: `ctr-sent-${c.id}`,
          kind: "event",
          at: c.sent_at,
          icon: "send",
          tone: "info",
          text: `Kontrakt sendt (${c.channel === "sms" ? "SMS" : "e-post"})`,
        });
      }
      if (c.signed_at) {
        items.push({
          id: `ctr-sign-${c.id}`,
          kind: "event",
          at: c.signed_at,
          icon: "check",
          tone: "sale",
          text: "Kontrakt signert 🎉",
        });
      }
    }

    items.sort((a, b) => a.at.localeCompare(b.at));
    return items;
  }, [notes, deals, contracts]);

  // Rull til bunnen når nye meldinger kommer.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline.length]);

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
    <div className="card flex h-[70vh] flex-col overflow-hidden p-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-lg font-bold text-slate-900">Logg</h2>
        <span className="text-xs font-medium text-slate-400">
          {timeline.length}{" "}
          {timeline.length === 1 ? "hendelse" : "hendelser"}
        </span>
      </div>

      {/* Meldinger */}
      <div className="thin-scroll flex-1 space-y-3 overflow-y-auto bg-slate-50/40 px-4 py-4">
        {timeline.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">
            Ingen aktivitet ennå. Skriv en melding under, eller send et tilbud –
            så dukker det opp her.
          </p>
        )}

        {timeline.map((item) =>
          item.kind === "note" ? (
            <NoteBubble
              key={item.id}
              text={item.text}
              at={item.at}
              author={
                item.authorId
                  ? nameMap[item.authorId] ?? "Ukjent"
                  : "System"
              }
              noteType={item.noteType ?? "general"}
            />
          ) : (
            <EventBubble
              key={item.id}
              text={item.text}
              at={item.at}
              icon={item.icon ?? "dagsavis"}
              tone={item.tone ?? "info"}
            />
          ),
        )}
        <div ref={bottomRef} />
      </div>

      {/* Skrivefelt nederst */}
      <div className="border-t border-slate-200 bg-white p-3">
        <div className="flex items-end gap-2">
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value as NoteType)}
            className="shrink-0 rounded-lg border border-slate-300 px-2 py-2 text-xs text-slate-600"
            title="Type"
          >
            <option value="call">Samtale</option>
            <option value="general">Notat</option>
            <option value="meeting">Møte</option>
          </select>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                addNote();
              }
            }}
            rows={1}
            placeholder="Skriv en melding … (Enter for å sende, Shift+Enter for ny linje)"
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            onClick={addNote}
            disabled={saving || !body.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Manuelt notat – høyrejustert boble (som «meg» i en chat).
function NoteBubble({
  text,
  at,
  author,
  noteType,
}: {
  text: string;
  at: string;
  author: string;
  noteType: NoteType;
}) {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-[15px] leading-relaxed text-white shadow-sm">
        <p className="whitespace-pre-wrap">{text}</p>
      </div>
      <div className="mt-1 flex items-center gap-1.5 pr-1 text-2xs text-slate-400">
        <span className="rounded bg-slate-100 px-1 py-0.5 font-medium text-slate-500">
          {NOTE_TYPE_LABELS[noteType]}
        </span>
        <span>{author}</span>
        <span>·</span>
        <span>{formatDateTime(at)}</span>
      </div>
    </div>
  );
}

// Automatisk hendelse – venstrejustert boble (som «motparten»/systemet).
function EventBubble({
  text,
  at,
  icon,
  tone,
}: {
  text: string;
  at: string;
  icon: IconName;
  tone: Tone;
}) {
  const s = TONE_STYLE[tone];
  return (
    <div className="flex items-start gap-2">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${s.bg} ${s.text}`}
      >
        <Icon name={icon} size={15} />
      </span>
      <div className="flex flex-col items-start">
        <div
          className={`max-w-[82%] rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm font-medium shadow-sm ${s.bg} ${s.text}`}
        >
          {text}
        </div>
        <span className="mt-1 pl-1 text-2xs text-slate-400">
          {formatDateTime(at)}
        </span>
      </div>
    </div>
  );
}
