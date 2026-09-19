"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Delivery = {
  id: string;
  category: string;
  recipient: string;
  subject: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  last_event_at: string | null;
  created_at: string;
};

type AuditEvent = {
  id: string;
  category: string;
  action: string;
  summary: string;
  created_at: string;
  actor: { full_name: string | null; email: string | null } | null;
};

type RecoveryCheckpoint = {
  checked_at: string;
  note: string | null;
  checked_by: { full_name: string | null; email: string | null } | null;
} | null;

const categoryLabel: Record<string, string> = {
  contract: "Kontrakt",
  contract_copy: "Kontraktskopi",
  contract_expiry: "Avtalepåminnelse",
  invitation: "Invitasjon",
  daily_report: "Dagsavis",
  system: "System",
};

const statusLabel: Record<string, string> = {
  sent: "Sendt til Resend",
  delivered: "Levert",
  delayed: "Forsinket",
  bounced: "Avvist",
  complained: "Spamklage",
  opened: "Åpnet",
  failed: "Feilet",
};

function formatTime(value: string | null) {
  if (!value) return "Ikke sendt";
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Oslo",
  }).format(new Date(value));
}

function StatusPill({ status }: { status: string }) {
  const className = status === "delivered" || status === "opened"
    ? "bg-emerald-100 text-emerald-800"
    : status === "failed" || status === "bounced" || status === "complained"
      ? "bg-red-100 text-red-800"
      : status === "delayed"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{statusLabel[status] ?? status}</span>;
}

export default function OperationsSecurityPanel({
  deliveries,
  auditEvents,
  recovery,
  webhookConfigured,
}: {
  deliveries: Delivery[];
  auditEvents: AuditEvent[];
  recovery: RecoveryCheckpoint;
  webhookConfigured: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function confirmRecoveryCheck() {
    const accepted = window.confirm(
      "Bekreft bare etter at du har kontrollert backup og testet gjenoppretting i Supabase. Dette gjenoppretter ikke produksjonsdata.",
    );
    if (!accepted) return;
    setConfirming(true);
    setMessage(null);
    const res = await fetch("/api/operations/recovery-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    });
    const data = await res.json().catch(() => ({}));
    setConfirming(false);
    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "Kunne ikke lagre kontrollen." });
      return;
    }
    setMessage({ type: "ok", text: "Kontrollen er lagret i driftsloggen." });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-2 p-5">
          <p className="label-eyebrow">Levering</p>
          <p className="text-2xl font-bold text-slate-900">{deliveries.length}</p>
          <p className="text-sm text-slate-500">Registrerte e-postforsøk de siste 60 dagene.</p>
        </div>
        <div className="card space-y-2 p-5">
          <p className="label-eyebrow">Trenger oppfølging</p>
          <p className="text-2xl font-bold text-slate-900">{deliveries.filter((delivery) => ["failed", "bounced", "complained"].includes(delivery.status)).length}</p>
          <p className="text-sm text-slate-500">Feilet, avvist eller markert som spam.</p>
        </div>
        <div className="card space-y-2 p-5">
          <p className="label-eyebrow">Siste gjenopprettingskontroll</p>
          <p className="text-sm font-semibold text-slate-900">{recovery ? formatTime(recovery.checked_at) : "Ikke registrert"}</p>
          <p className="text-sm text-slate-500">{recovery?.checked_by?.full_name || recovery?.checked_by?.email || "Krever lederbekreftelse"}</p>
        </div>
      </section>

      <section className="card space-y-4 p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-bold text-slate-900">E-postlevering</h2>
            <p className="mt-1 text-sm text-slate-500">Status kommer fra Resend, ikke bare fra at CRM-et forsøkte å sende.</p>
          </div>
          <p className={`rounded-lg px-3 py-2 text-xs ${webhookConfigured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            {webhookConfigured ? "Webhook er konfigurert" : "Webhook må kobles til i Resend"}
          </p>
        </div>
        {!webhookConfigured && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Legg til <strong>https://crm.media-norge.com/api/webhooks/resend</strong> i Resend og lagre signing secret som <strong>RESEND_WEBHOOK_SECRET</strong> i Vercel. Før det vises bare utsendingsforsøket, ikke faktisk levering.</p>}
        {deliveries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">Ingen utsendelser er registrert ennå. Send en testmelding etter at Resend-webhooken er lagt inn.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-2 py-3">Type</th><th className="px-2 py-3">Mottaker</th><th className="px-2 py-3">Emne</th><th className="px-2 py-3">Status</th><th className="px-2 py-3">Sist oppdatert</th></tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-3 font-medium text-slate-700">{categoryLabel[delivery.category] ?? delivery.category}</td>
                    <td className="px-2 py-3 text-slate-700">{delivery.recipient}</td>
                    <td className="max-w-72 px-2 py-3 text-slate-600">{delivery.subject}{delivery.error_message && <p className="mt-1 text-xs text-red-700">{delivery.error_message}</p>}</td>
                    <td className="px-2 py-3"><StatusPill status={delivery.status} /></td>
                    <td className="whitespace-nowrap px-2 py-3 text-slate-500">{formatTime(delivery.last_event_at ?? delivery.sent_at ?? delivery.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Backup og gjenoppretting</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Databasen kan gjenopprettes fra Supabase. Slettede filer i Storage følger ikke databackupen, så viktige opplastede dokumenter må også ha egen eksport eller oppbevaring.</p>
          </div>
          <button onClick={confirmRecoveryCheck} disabled={confirming} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {confirming ? "Lagrer …" : "Bekreft testet gjenoppretting"}
          </button>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>Kontroller at en nylig backup eller gjenopprettingsperiode finnes i Supabase.</li>
          <li>Test gjenoppretting til et separat prosjekt, ikke denne produksjonsdatabasen.</li>
          <li>Kontroller minst innlogging, kunder, kontrakter og filer før du registrerer kontrollen her.</li>
        </ol>
        {recovery?.note && <p className="text-sm text-slate-600">Notat: {recovery.note}</p>}
        {message && <p className={`text-sm ${message.type === "ok" ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
      </section>

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Viktige endringer</h2>
          <p className="mt-1 text-sm text-slate-500">Tilgangsendringer og kritiske e-postavvik lagres her.</p>
        </div>
        {auditEvents.length === 0 ? <p className="text-sm text-slate-500">Ingen hendelser er registrert ennå.</p> : (
          <ul className="divide-y divide-slate-100">
            {auditEvents.map((event) => <li key={event.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="text-slate-800">{event.summary}</span>
              <span className="whitespace-nowrap text-xs text-slate-500">{event.actor?.full_name || event.actor?.email || "Systemet"} · {formatTime(event.created_at)}</span>
            </li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
