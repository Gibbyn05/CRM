"use client";

import { useMemo } from "react";
import { formatDateTime } from "@/lib/format";
import type { SmsReminderRecipientType, SmsReminderStatus } from "@/lib/types";

export interface MessageLogRow {
  id: string;
  recipient_type: SmsReminderRecipientType;
  phone_number: string;
  status: SmsReminderStatus;
  error: string | null;
  send_at: string;
  appointment_title: string;
  customer_name: string | null;
}

const STATUS_STYLE: Record<SmsReminderStatus, string> = {
  scheduled: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
  delivered: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-400",
};

const STATUS_LABEL: Record<SmsReminderStatus, string> = {
  scheduled: "Planlagt",
  sent: "Sendt",
  delivered: "Levert",
  failed: "Mislykket",
  cancelled: "Avbrutt",
};

// Samlet meldingslogg + enkel oversikt over SMS-påminnelser på tvers av alle
// avtaler. Leveringsgrad for e-post/kontrakter vises i den eksisterende
// Signering-oversikten; dette panelet dekker SMS-avtalepåminnelser.
export default function MessageLogPanel({ reminders }: { reminders: MessageLogRow[] }) {
  const stats = useMemo(() => {
    const total = reminders.length;
    const sent = reminders.filter((r) => r.status === "sent" || r.status === "delivered").length;
    const failed = reminders.filter((r) => r.status === "failed").length;
    const rate = total > 0 ? Math.round((sent / total) * 100) : null;
    return { total, sent, failed, rate };
  }, [reminders]);

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">Meldingslogg (SMS-påminnelser)</h2>
        <div className="flex gap-4 text-sm text-slate-500">
          <span>
            Leveringsgrad: <strong className="text-slate-800">{stats.rate ?? "–"}%</strong>
          </span>
          <span>
            Mislykket: <strong className="text-slate-800">{stats.failed}</strong>
          </span>
        </div>
      </div>

      {reminders.length === 0 ? (
        <p className="text-sm text-slate-400">Ingen SMS-påminnelser registrert ennå.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Avtale</th>
                <th className="px-3 py-2">Mottaker</th>
                <th className="px-3 py-2">Nummer</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Tidspunkt</th>
                <th className="px-3 py-2">Feil</th>
              </tr>
            </thead>
            <tbody>
              {reminders.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.appointment_title}</div>
                    {r.customer_name && (
                      <div className="text-xs text-slate-400">{r.customer_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.recipient_type === "customer" ? "Kunde" : "Selger"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.phone_number}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{formatDateTime(r.send_at)}</td>
                  <td className="px-3 py-2 text-xs text-red-600">{r.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
