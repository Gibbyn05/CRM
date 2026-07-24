"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  Customer,
} from "@/lib/types";
import { APPOINTMENT_TYPE_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";

// Agenda-basert kalender med bookingskjema. Avtaler grupperes per dato.
// Kobles til kundekort via customer_id.
export default function CalendarView({
  initialAppointments,
  customers,
}: {
  initialAppointments: Appointment[];
  customers: Pick<Customer, "id" | "name">[];
}) {
  const supabase = createClient();
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "oppfolgingsmote" as AppointmentType,
    customer_id: "",
    starts_at: "",
    location: "",
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const key = a.starts_at.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [appointments]);

  async function book() {
    if (!form.title.trim() || !form.starts_at) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data } = await supabase
      .from("appointments")
      .insert({
        agent_id: user?.id,
        customer_id: form.customer_id || null,
        title: form.title.trim(),
        type: form.type,
        starts_at: new Date(form.starts_at).toISOString(),
        location: form.location || null,
      })
      .select("*")
      .single();

    if (data) {
      setAppointments((a) =>
        [...a, data as Appointment].sort((x, y) =>
          x.starts_at.localeCompare(y.starts_at),
        ),
      );
    }
    setOpen(false);
    setForm({
      title: "",
      type: "oppfolgingsmote",
      customer_id: "",
      starts_at: "",
      location: "",
    });
  }

  async function setStatus(a: Appointment, status: AppointmentStatus) {
    await supabase.from("appointments").update({ status }).eq("id", a.id);
    setAppointments((list) =>
      list.map((x) => (x.id === a.id ? { ...x, status } : x)),
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        + Book avtale
      </button>

      {grouped.length === 0 && (
        <p className="text-slate-500">Ingen avtaler booket.</p>
      )}

      {grouped.map(([date, items]) => (
        <div key={date} className="card p-4">
          <h3 className="mb-2 font-semibold text-slate-700">{formatDate(date)}</h3>
          <ul className="space-y-2">
            {items.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"
              >
                <div>
                  <span className="font-medium text-slate-800">{a.title}</span>
                  <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {APPOINTMENT_TYPE_LABELS[a.type]}
                  </span>
                  <div className="text-xs text-slate-400">
                    {formatTime(a.starts_at)}
                    {a.customer_id && (
                      <>
                        {" · "}
                        <Link
                          href={`/customers/${a.customer_id}`}
                          className="hover:underline"
                        >
                          kundekort
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                <select
                  value={a.status}
                  onChange={(e) =>
                    setStatus(a, e.target.value as AppointmentStatus)
                  }
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="planlagt">Planlagt</option>
                  <option value="bekreftet">Bekreftet</option>
                  <option value="gjennomfort">Gjennomført</option>
                  <option value="avlyst">Avlyst</option>
                  <option value="no_show">Ikke møtt</option>
                </select>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold">Book avtale</h2>
            <div className="space-y-3">
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Tittel"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as AppointmentType }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {(Object.keys(APPOINTMENT_TYPE_LABELS) as AppointmentType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {APPOINTMENT_TYPE_LABELS[t]}
                    </option>
                  ),
                )}
              </select>
              <select
                value={form.customer_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, customer_id: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— Ingen kunde —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) =>
                  setForm((f) => ({ ...f, starts_at: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={form.location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
                placeholder="Sted (valgfritt)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Avbryt
              </button>
              <button
                onClick={book}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Book
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
