"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type {
  Appointment,
  AppointmentStatus,
  Customer,
  EventType,
} from "@/lib/types";
import { formatTime } from "@/lib/format";
import Icon from "./Icon";

const WEEKDAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const MONTHS = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
];
// Fargepalett for nye hendelsestyper.
const PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#64748b",
];
const FALLBACK_COLOR = "#94a3b8";

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  planlagt: "Planlagt",
  bekreftet: "Bekreftet",
  gjennomfort: "Gjennomført",
  avlyst: "Avlyst",
  no_show: "Ikke møtt",
};

// Lokal datonøkkel (YYYY-MM-DD) uavhengig av tidssone.
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Interaktiv månedskalender. Klikk på en dato for å opprette hendelse,
// egendefinerte typer med farge, og filtrering mellom «mine» og «alle».
export default function CalendarView({
  initialAppointments,
  customers,
  initialEventTypes,
  currentUserId,
  isManager,
  nameMap,
}: {
  initialAppointments: Appointment[];
  customers: Pick<Customer, "id" | "name">[];
  initialEventTypes: EventType[];
  currentUserId: string;
  isManager: boolean;
  nameMap: Record<string, string>;
}) {
  const supabase = createClient();
  const [appointments, setAppointments] =
    useState<Appointment[]>(initialAppointments);
  const [eventTypes, setEventTypes] = useState<EventType[]>(initialEventTypes);

  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [scope, setScope] = useState<"mine" | "alle">("alle");
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const [createDate, setCreateDate] = useState<string | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);

  const typeById = useMemo(
    () => new Map(eventTypes.map((t) => [t.id, t])),
    [eventTypes],
  );

  // Live oppdatering på tvers av teamet.
  useEffect(() => {
    const channel = supabase
      .channel("calendar_appointments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        (payload) => {
          setAppointments((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((a) => a.id !== (payload.old as Appointment).id);
            }
            const row = payload.new as Appointment;
            const exists = prev.some((a) => a.id === row.id);
            return exists
              ? prev.map((a) => (a.id === row.id ? row : a))
              : [...prev, row];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Filtrer og grupper hendelser per dag.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      if (scope === "mine" && a.agent_id !== currentUserId) continue;
      if (a.event_type_id && hiddenTypes.has(a.event_type_id)) continue;
      const key = dayKey(new Date(a.starts_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    for (const list of map.values()) {
      list.sort((x, y) => x.starts_at.localeCompare(y.starts_at));
    }
    return map;
  }, [appointments, scope, hiddenTypes, currentUserId]);

  // Bygg 6x7-rutenett fra mandag.
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const offset = (first.getDay() + 6) % 7; // mandag = 0
    const start = new Date(cursor.year, cursor.month, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const todayKey = dayKey(today);

  function move(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function toggleType(id: string) {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Verktøylinje */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => move(-1)}
            aria-label="Forrige måned"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
          >
            <Icon name="chevron-left" size={18} />
          </button>
          <h2 className="min-w-[9.5rem] text-center text-lg font-bold capitalize text-slate-900">
            {MONTHS[cursor.month]} {cursor.year}
          </h2>
          <button
            onClick={() => move(1)}
            aria-label="Neste måned"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
          >
            <Icon name="chevron-right" size={18} />
          </button>
          <button
            onClick={() =>
              setCursor({ year: today.getFullYear(), month: today.getMonth() })
            }
            className="ml-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            I dag
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Mine / Alle */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {(["mine", "alle"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                aria-pressed={scope === s}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  scope === s
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {s === "mine" ? "Mine" : "Alle"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setCreateDate(todayKey)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Icon name="plus" size={16} />
            Ny hendelse
          </button>
        </div>
      </div>

      {/* Fargeforklaring / typefilter */}
      {eventTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {eventTypes.map((t) => {
            const off = hiddenTypes.has(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggleType(t.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  off
                    ? "border-slate-200 text-slate-400"
                    : "border-slate-300 text-slate-600"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: off ? "#cbd5e1" : t.color }}
                />
                {t.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Månedsrutenett */}
      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="label-eyebrow py-2 text-center"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const key = dayKey(d);
            const inMonth = d.getMonth() === cursor.month;
            const isToday = key === todayKey;
            const dayEvents = eventsByDay.get(key) ?? [];
            return (
              <button
                key={i}
                onClick={() => setCreateDate(key)}
                className={`group flex min-h-[92px] flex-col gap-1 border-b border-r border-slate-100 p-1.5 text-left transition hover:bg-brand-50/40 ${
                  inMonth ? "bg-white" : "bg-slate-50/60"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-semibold ${
                    isToday
                      ? "bg-brand-600 text-white"
                      : inMonth
                        ? "text-slate-600"
                        : "text-slate-300"
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="flex flex-col gap-0.5">
                  {dayEvents.slice(0, 3).map((a) => {
                    const t = a.event_type_id
                      ? typeById.get(a.event_type_id)
                      : undefined;
                    const color = t?.color ?? FALLBACK_COLOR;
                    return (
                      <span
                        key={a.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(a);
                        }}
                        className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-2xs font-medium ${
                          a.status === "avlyst" ? "line-through opacity-60" : ""
                        }`}
                        style={{ backgroundColor: `${color}22`, color }}
                      >
                        <span className="shrink-0 text-3xs opacity-80">
                          {formatTime(a.starts_at)}
                        </span>
                        <span className="truncate">{a.title}</span>
                      </span>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="px-1 text-3xs font-medium text-slate-400">
                      +{dayEvents.length - 3} flere
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {createDate && (
        <CreateModal
          date={createDate}
          customers={customers}
          eventTypes={eventTypes}
          onAddType={(t) => setEventTypes((prev) => [...prev, t])}
          onClose={() => setCreateDate(null)}
          onCreated={(a) =>
            setAppointments((prev) =>
              prev.some((x) => x.id === a.id) ? prev : [...prev, a],
            )
          }
        />
      )}

      {editing && (
        <DetailModal
          appointment={editing}
          eventType={
            editing.event_type_id ? typeById.get(editing.event_type_id) : undefined
          }
          agentName={nameMap[editing.agent_id] ?? "Ukjent"}
          canManage={isManager || editing.agent_id === currentUserId}
          onClose={() => setEditing(null)}
          onChanged={(a) =>
            setAppointments((prev) => prev.map((x) => (x.id === a.id ? a : x)))
          }
          onDeleted={(id) => {
            setAppointments((prev) => prev.filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────── Opprett-modal ─────────────────────────
function CreateModal({
  date,
  customers,
  eventTypes,
  onAddType,
  onClose,
  onCreated,
}: {
  date: string;
  customers: Pick<Customer, "id" | "name">[];
  eventTypes: EventType[];
  onAddType: (t: EventType) => void;
  onClose: () => void;
  onCreated: (a: Appointment) => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState({
    title: "",
    event_type_id: eventTypes[0]?.id ?? "",
    customer_id: "",
    date,
    time: "09:00",
    end_time: "",
    location: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ny type-panel
  const [newTypeOpen, setNewTypeOpen] = useState(false);
  const [newType, setNewType] = useState({ name: "", color: PALETTE[0] });

  async function createType() {
    if (!newType.name.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error: err } = await supabase
      .from("event_types")
      .insert({
        name: newType.name.trim(),
        color: newType.color,
        created_by: user?.id ?? null,
        sort_order: 100,
      })
      .select("*")
      .single();
    if (err || !data) {
      setError(err?.message ?? "Kunne ikke opprette type.");
      return;
    }
    onAddType(data as EventType);
    setForm((f) => ({ ...f, event_type_id: (data as EventType).id }));
    setNewType({ name: "", color: PALETTE[0] });
    setNewTypeOpen(false);
  }

  async function save() {
    if (!form.title.trim()) {
      setError("Tittel er påkrevd.");
      return;
    }
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const startsAt = new Date(`${form.date}T${form.time || "09:00"}`).toISOString();
    const endsAt = form.end_time
      ? new Date(`${form.date}T${form.end_time}`).toISOString()
      : null;

    const { data, error: err } = await supabase
      .from("appointments")
      .insert({
        agent_id: user?.id,
        customer_id: form.customer_id || null,
        title: form.title.trim(),
        event_type_id: form.event_type_id || null,
        starts_at: startsAt,
        ends_at: endsAt,
        location: form.location.trim() || null,
      })
      .select("*")
      .single();

    setSaving(false);
    if (err || !data) {
      setError(err?.message ?? "Kunne ikke opprette hendelse.");
      return;
    }
    onCreated(data as Appointment);
    onClose();
  }

  return (
    <Modal onClose={onClose} title="Ny hendelse">
      <div className="space-y-3">
        <input
          autoFocus
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Tittel"
          className={inputCls}
        />

        {/* Type + ny type */}
        <div>
          <div className="flex items-center gap-2">
            <select
              value={form.event_type_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, event_type_id: e.target.value }))
              }
              className={inputCls}
            >
              <option value="">— Ingen type —</option>
              {eventTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setNewTypeOpen((o) => !o)}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              + Ny type
            </button>
          </div>
          {newTypeOpen && (
            <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <input
                value={newType.name}
                onChange={(e) =>
                  setNewType((t) => ({ ...t, name: e.target.value }))
                }
                placeholder="Navn på type"
                className={inputCls}
              />
              <div className="flex flex-wrap gap-1.5">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewType((t) => ({ ...t, color: c }))}
                    aria-label={c}
                    className={`h-6 w-6 rounded-full transition ${
                      newType.color === c
                        ? "ring-2 ring-slate-900 ring-offset-1"
                        : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={createType}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
              >
                Lagre type
              </button>
            </div>
          )}
        </div>

        <select
          value={form.customer_id}
          onChange={(e) =>
            setForm((f) => ({ ...f, customer_id: e.target.value }))
          }
          className={inputCls}
        >
          <option value="">— Ingen kunde —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-1 text-xs text-slate-500">
            Dato
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="col-span-1 text-xs text-slate-500">
            Fra
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              className={inputCls}
            />
          </label>
          <label className="col-span-1 text-xs text-slate-500">
            Til
            <input
              type="time"
              value={form.end_time}
              onChange={(e) =>
                setForm((f) => ({ ...f, end_time: e.target.value }))
              }
              className={inputCls}
            />
          </label>
        </div>

        <input
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          placeholder="Sted (valgfritt)"
          className={inputCls}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Avbryt
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Lagrer …" : "Opprett"}
        </button>
      </div>
    </Modal>
  );
}

// ───────────────────────── Detalj-modal ─────────────────────────
function DetailModal({
  appointment,
  eventType,
  agentName,
  canManage,
  onClose,
  onChanged,
  onDeleted,
}: {
  appointment: Appointment;
  eventType?: EventType;
  agentName: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: (a: Appointment) => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const color = eventType?.color ?? FALLBACK_COLOR;
  const start = new Date(appointment.starts_at);

  async function setStatus(status: AppointmentStatus) {
    setBusy(true);
    const { data } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appointment.id)
      .select("*")
      .single();
    setBusy(false);
    if (data) onChanged(data as Appointment);
  }

  async function remove() {
    if (!confirm("Slette denne hendelsen?")) return;
    setBusy(true);
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointment.id);
    setBusy(false);
    if (!error) onDeleted(appointment.id);
  }

  return (
    <Modal onClose={onClose} title="Hendelse">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-medium text-slate-500">
            {eventType?.name ?? "Ingen type"}
          </span>
        </div>
        <h3 className="text-lg font-bold text-slate-900">{appointment.title}</h3>
        <p className="text-sm text-slate-600">
          {start.toLocaleDateString("nb-NO", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}{" "}
          kl. {formatTime(appointment.starts_at)}
          {appointment.ends_at ? `–${formatTime(appointment.ends_at)}` : ""}
        </p>
        {appointment.location && (
          <p className="text-sm text-slate-600">📍 {appointment.location}</p>
        )}
        <p className="text-sm text-slate-500">Ansvarlig: {agentName}</p>
        {appointment.customer_id && (
          <Link
            href={`/customers/${appointment.customer_id}`}
            className="inline-block text-sm font-medium text-brand-600 hover:underline"
          >
            Åpne kundekort →
          </Link>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Status
          </label>
          <select
            value={appointment.status}
            disabled={!canManage || busy}
            onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
            className={inputCls}
          >
            {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        {canManage ? (
          <button
            onClick={remove}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Icon name="trash" size={16} />
            Slett
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={onClose}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
        >
          Lukk
        </button>
      </div>
    </Modal>
  );
}

// ───────────────────────── Delt modal-skall ─────────────────────────
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="animate-panel-in max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl thin-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Lukk"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
