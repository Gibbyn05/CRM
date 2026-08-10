"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isSameDay, isToday, isYesterday } from "date-fns";
import { nb } from "date-fns/locale";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type {
  Appointment,
  CallLog,
  Commission,
  Contract,
  Deal,
  Note,
  NoteType,
  Reminder,
} from "@/lib/types";
import { formatCurrency, formatTime } from "@/lib/format";
import Icon, { type IconName } from "./Icon";

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  call: "Samtale",
  general: "Notat",
  meeting: "Møte",
  system: "System",
};

type ActivityType =
  | "call"
  | "email"
  | "meeting"
  | "note"
  | "task"
  | "status"
  | "offer"
  | "signature"
  | "payment";

interface TimelineItem {
  id: string;
  type: ActivityType;
  at: string;
  title: string;
  text: string;
  authorId?: string | null;
  noteType?: NoteType;
  details?: string;
  manual?: boolean;
}

const ACTIVITY_STYLE: Record<
  ActivityType,
  { icon: IconName; iconClass: string; label: string }
> = {
  call: { icon: "phone", iconClass: "bg-[#e8f7ef] text-[#087a4b]", label: "Samtale" },
  email: { icon: "mail", iconClass: "bg-[#e9f2fb] text-[#296a9b]", label: "E-post" },
  meeting: { icon: "calendar", iconClass: "bg-[#f1ebfa] text-[#765098]", label: "Møte" },
  note: { icon: "receipt", iconClass: "bg-[#fff1db] text-[#9b641b]", label: "Notat" },
  task: { icon: "check", iconClass: "bg-[#e8f7ef] text-[#087a4b]", label: "Oppgave" },
  status: { icon: "route", iconClass: "bg-[#f3eee5] text-[#725b3f]", label: "Status" },
  offer: { icon: "pipeline", iconClass: "bg-[#fff0e9] text-[#aa4c2e]", label: "Tilbud" },
  signature: { icon: "check", iconClass: "bg-[#e8f7ef] text-[#087a4b]", label: "Signering" },
  payment: { icon: "wallet", iconClass: "bg-[#e7f6f4] text-[#167c73]", label: "Betaling" },
};

export default function NotesLog({
  customerId,
  initialNotes,
  deals,
  contracts,
  calls,
  appointments,
  reminders,
  commissions,
  nameMap,
}: {
  customerId: string;
  initialNotes: Note[];
  deals: Deal[];
  contracts: Contract[];
  calls: CallLog[];
  appointments: Appointment[];
  reminders: Reminder[];
  commissions: Commission[];
  nameMap: Record<string, string>;
}) {
  const supabase = createClient();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("general");
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`notes_${customerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notes", filter: `customer_id=eq.${customerId}` },
        (payload) => {
          const note = payload.new as Note;
          setNotes((previous) =>
            previous.some((item) => item.id === note.id) ? previous : [...previous, note],
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId, supabase]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = notes.map((note) => ({
      id: `note-${note.id}`,
      type: note.note_type === "meeting" ? "meeting" : note.note_type === "call" ? "call" : "note",
      at: note.created_at,
      title: NOTE_TYPE_LABELS[note.note_type],
      text: note.body,
      authorId: note.author_id,
      noteType: note.note_type,
      manual: note.note_type !== "system",
    }));

    for (const call of calls) {
      const at = call.ended_at ?? call.started_at ?? call.created_at;
      const status = call.status === "answered" || call.status === "ended" ? "Besvart" : call.status === "missed" ? "Ubesvart" : "Utgående";
      const duration = call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)} min ${call.duration_seconds % 60} sek` : null;
      items.push({ id: `call-${call.id}`, type: "call", at, title: "Samtale", text: `${status} samtale`, details: [call.phone_number, duration].filter(Boolean).join(" · "), authorId: call.agent_id });
    }

    for (const appointment of appointments) {
      items.push({ id: `meeting-${appointment.id}`, type: "meeting", at: appointment.updated_at, title: appointment.title, text: appointment.status === "gjennomfort" ? "Møte gjennomført" : "Møte registrert", details: `${format(new Date(appointment.starts_at), "d. MMM 'kl.' HH:mm", { locale: nb })}${appointment.location ? ` · ${appointment.location}` : ""}`, authorId: appointment.agent_id });
    }

    for (const reminder of reminders) {
      items.push({ id: `task-${reminder.id}`, type: "task", at: reminder.done_at ?? reminder.updated_at ?? reminder.created_at, title: reminder.title, text: reminder.done ? "Oppgave fullført" : "Oppgave opprettet", details: `Frist ${format(new Date(reminder.due_at), "d. MMM 'kl.' HH:mm", { locale: nb })}`, authorId: reminder.agent_id });
    }

    for (const deal of deals) {
      const amount = deal.amount == null ? "" : ` · ${formatCurrency(deal.amount, deal.currency)}`;
      if (deal.created_at && !deal.offer_sent_at) items.push({ id: `deal-${deal.id}`, type: "offer", at: deal.created_at, title: "Nytt salg", text: deal.title, details: amount.replace(/^ · /, ""), authorId: deal.agent_id });
      if (deal.offer_sent_at) items.push({ id: `offer-${deal.id}`, type: "offer", at: deal.offer_sent_at, title: "Tilbud sendt", text: deal.title, details: amount.replace(/^ · /, ""), authorId: deal.agent_id });
      if (deal.offer_accepted_at) items.push({ id: `accepted-${deal.id}`, type: "signature", at: deal.offer_accepted_at, title: "Tilbud akseptert", text: deal.title, details: amount.replace(/^ · /, ""), authorId: deal.agent_id });
    }

    for (const contract of contracts) {
      if (contract.sent_at) items.push({ id: `contract-${contract.id}`, type: contract.channel === "email" ? "email" : "offer", at: contract.sent_at, title: "Kontrakt sendt", text: `Sendt via ${contract.channel === "sms" ? "SMS" : "e-post"}`, details: contract.recipient, authorId: contract.agent_id });
      if (contract.signed_at) items.push({ id: `signed-${contract.id}`, type: "signature", at: contract.signed_at, title: "Kontrakt signert", text: "Avtalen er signert", details: contract.recipient, authorId: contract.agent_id });
    }

    for (const commission of commissions) {
      if (!commission.invoiced_at && !commission.paid_at && commission.status !== "forfalt") continue;
      const paid = commission.status === "betalt";
      items.push({ id: `payment-${commission.id}`, type: "payment", at: commission.paid_at ?? commission.invoiced_at ?? commission.updated_at, title: paid ? "Betaling registrert" : commission.status === "forfalt" ? "Betaling forfalt" : "Faktura sendt", text: formatCurrency(commission.sale_amount), authorId: commission.agent_id });
    }

    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [appointments, calls, commissions, contracts, deals, notes, reminders]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [timeline.length]);

  async function addNote() {
    if (!body.trim() || saving) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("notes").insert({ customer_id: customerId, author_id: user?.id ?? null, note_type: noteType, body: body.trim() });
    setBody("");
    setSaving(false);
  }

  return (
    <section className="flex h-[calc(100dvh-12rem)] min-h-[650px] flex-col bg-[#fbfaf7] lg:h-full lg:min-h-0">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7ddcd] bg-white px-5 py-3">
        <div>
          <h2 className="text-base font-bold text-[#2b2118]">Aktivitetslogg</h2>
          <p className="mt-0.5 text-xs text-[#8a8177]">Hele kundehistorikken, eldste til nyeste</p>
        </div>
        <span className="rounded-lg border border-[#ddd1bd] bg-[#fffaf0] px-3 py-1.5 text-xs font-semibold text-[#64594e]">
          {timeline.length} {timeline.length === 1 ? "aktivitet" : "aktiviteter"}
        </span>
      </header>

      <div ref={scrollRef} className="thin-scroll relative flex-1 overflow-y-auto px-4 py-7 sm:px-7 lg:px-10">
        <div className="pointer-events-none absolute bottom-0 right-[2.72rem] top-0 hidden w-px bg-[#e6ddcf] sm:block" />
        {timeline.length === 0 ? (
          <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f7ef] text-[#087a4b]"><Icon name="dagsavis" size={21} /></span>
            <h3 className="mt-4 font-semibold text-[#2b2118]">Ingen aktivitet ennå</h3>
            <p className="mt-1 max-w-sm text-sm text-[#8a8177]">Notater, samtaler, møter, oppgaver, tilbud, signeringer og betalinger vises her.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {timeline.map((item, index) => {
              const previous = timeline[index - 1];
              const showDate = !previous || !isSameDay(new Date(previous.at), new Date(item.at));
              return (
                <div key={item.id}>
                  {showDate && <DateSeparator date={item.at} />}
                  <ActivityCard item={item} author={item.authorId ? nameMap[item.authorId] ?? "Ukjent" : "System"} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer className="border-t border-[#ddd1bd] bg-white p-3 sm:p-4">
        <div className="rounded-2xl border border-[#b8dcca] bg-white p-2 shadow-[0_8px_24px_rgba(39,73,55,0.08)] focus-within:border-[#00a965] focus-within:ring-2 focus-within:ring-[#00a965]/10">
          <textarea value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); addNote(); } }} rows={2} placeholder="Skriv et notat og trykk Enter for å lagre" className="max-h-32 min-h-[3.25rem] w-full resize-none border-0 bg-transparent px-2 py-1 text-sm text-[#2b2118] outline-none placeholder:text-[#a49c92]" />
          <div className="flex items-center justify-between gap-2 border-t border-[#eee7dc] pt-2">
            <select value={noteType} onChange={(event) => setNoteType(event.target.value as NoteType)} className="rounded-lg border-0 bg-[#f5f1ea] px-3 py-2 text-xs font-semibold text-[#64594e] outline-none" aria-label="Aktivitetstype">
              <option value="general">Notat</option><option value="call">Samtale</option><option value="meeting">Møte</option>
            </select>
            <button type="button" onClick={addNote} disabled={saving || !body.trim()} className="flex h-9 items-center gap-2 rounded-xl bg-[#171717] px-4 text-xs font-bold text-white transition hover:bg-[#087a4b] disabled:cursor-not-allowed disabled:opacity-35">
              {saving ? "Lagrer" : "Lagre"}<Icon name="send" size={14} />
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
}

function DateSeparator({ date }: { date: string }) {
  const value = new Date(date);
  const label = isToday(value) ? "I dag" : isYesterday(value) ? "I går" : format(value, "d. MMMM yyyy", { locale: nb });
  return <div className="mb-5 flex items-center gap-3"><span className="h-px flex-1 bg-[#e7ddcd]" /><span className="rounded-full border border-[#e7ddcd] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a8177]">{label}</span><span className="h-px flex-1 bg-[#e7ddcd]" /></div>;
}

function ActivityCard({ item, author }: { item: TimelineItem; author: string }) {
  const style = ACTIVITY_STYLE[item.type];
  return (
    <article className="relative mb-5 ml-auto flex max-w-2xl items-start justify-end gap-3 sm:pr-0">
      <div className={`min-w-0 rounded-2xl border px-4 py-3 shadow-[0_5px_18px_rgba(55,42,28,0.06)] ${item.manual ? "border-[#a8dbc3] bg-[#eaf8f1]" : "border-[#e2d9cb] bg-white"}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#087a4b]">{style.label}</span>
          <span className="text-[11px] text-[#9a9187]">{formatTime(item.at)}</span>
        </div>
        <h3 className="mt-1 text-sm font-bold text-[#2b2118]">{item.title}</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#564c42]">{item.text}</p>
        {item.details && <p className="mt-2 border-t border-black/5 pt-2 text-xs text-[#81766b]">{item.details}</p>}
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9a9187]">{author}</p>
      </div>
      <span className={`relative z-10 mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-[#fbfaf7] ${style.iconClass}`}><Icon name={style.icon} size={17} /></span>
    </article>
  );
}
