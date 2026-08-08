"use client";

import { useEffect, useMemo, useState } from "react";
import type { Organization, SmsReminderRecipients } from "@/lib/types";
import { buildReminderVars, renderReminderSms } from "@/lib/sms-templates";
import Icon from "./Icon";

interface AuditEntry {
  id: string;
  summary: string;
  created_at: string;
  actor_name: string;
}

interface DomainRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  status: string;
}
interface DomainInfo {
  id: string;
  name: string;
  status: string;
  records: DomainRecord[];
}
interface DomainStatusResponse {
  ok: boolean;
  configured: boolean;
  error?: string;
  domains: DomainInfo[];
  configured_domain: string | null;
  configured_domain_verified: boolean;
}

type FormState = {
  timezone: string;
  email_from_name: string;
  email_from_address: string;
  email_reply_to: string;
  email_link_domain: string;
  sms_from_name: string;
  sms_default_phone: string;
  sms_reminders_enabled: boolean;
  sms_reminder_recipients: SmsReminderRecipients;
  sms_reminder_offsets_hours: string; // komma-separert i UI, f.eks. "24, 1"
  sms_template_customer: string;
  sms_template_agent: string;
};

function toForm(org: Organization | null): FormState {
  return {
    timezone: org?.timezone ?? "Europe/Oslo",
    email_from_name: org?.email_from_name ?? "",
    email_from_address: org?.email_from_address ?? "",
    email_reply_to: org?.email_reply_to ?? "",
    email_link_domain: org?.email_link_domain ?? "",
    sms_from_name: org?.sms_from_name ?? "",
    sms_default_phone: org?.sms_default_phone ?? "",
    sms_reminders_enabled: org?.sms_reminders_enabled ?? false,
    sms_reminder_recipients: org?.sms_reminder_recipients ?? "both",
    sms_reminder_offsets_hours: (org?.sms_reminder_offsets_hours ?? [24, 1]).join(", "),
    sms_template_customer: org?.sms_template_customer ?? "",
    sms_template_agent: org?.sms_template_agent ?? "",
  };
}

export default function CommunicationSettings({
  initialOrg,
  emailConfigured,
  smsConfigured,
  smsProviderId,
  auditLog,
}: {
  initialOrg: Organization | null;
  emailConfigured: boolean;
  smsConfigured: boolean;
  smsProviderId: string;
  auditLog: AuditEntry[];
}) {
  const [form, setForm] = useState<FormState>(toForm(initialOrg));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [domainStatus, setDomainStatus] = useState<DomainStatusResponse | null>(null);
  const [domainLoading, setDomainLoading] = useState(false);

  const [testEmailTo, setTestEmailTo] = useState("");
  const [testEmailResult, setTestEmailResult] = useState<string | null>(null);
  const [testEmailBusy, setTestEmailBusy] = useState(false);

  const [testSmsTo, setTestSmsTo] = useState("");
  const [testSmsResult, setTestSmsResult] = useState<string | null>(null);
  const [testSmsBusy, setTestSmsBusy] = useState(false);

  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function loadDomainStatus() {
    if (!emailConfigured) return;
    setDomainLoading(true);
    try {
      const res = await fetch("/api/settings/communication/domain-status");
      const j = (await res.json()) as DomainStatusResponse;
      setDomainStatus(j);
    } finally {
      setDomainLoading(false);
    }
  }

  useEffect(() => {
    loadDomainStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    const offsets = form.sms_reminder_offsets_hours
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    const res = await fetch("/api/settings/communication", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timezone: form.timezone,
        email_from_name: form.email_from_name || null,
        email_from_address: form.email_from_address || null,
        email_reply_to: form.email_reply_to || null,
        email_link_domain: form.email_link_domain || null,
        sms_from_name: form.sms_from_name || null,
        sms_default_phone: form.sms_default_phone || null,
        sms_reminders_enabled: form.sms_reminders_enabled,
        sms_reminder_recipients: form.sms_reminder_recipients,
        sms_reminder_offsets_hours: offsets.length ? offsets : [24, 1],
        sms_template_customer: form.sms_template_customer || null,
        sms_template_agent: form.sms_template_agent || null,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMessage({ ok: false, text: j.error ?? "Kunne ikke lagre." });
      return;
    }
    setMessage({ ok: true, text: "Lagret." });
    loadDomainStatus();
  }

  async function sendTestEmail() {
    setTestEmailBusy(true);
    setTestEmailResult(null);
    try {
      const res = await fetch("/api/settings/communication/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmailTo }),
      });
      const j = await res.json();
      if (!j.configured) {
        setTestEmailResult(`❌ ${j.error}`);
      } else if (j.ok) {
        setTestEmailResult(
          `✅ Sendt via ${j.provider} (id: ${j.provider_ref ?? "–"}). Avsenderdomene: ${j.sender_domain}${
            j.using_shared_test_domain ? " (⚠ delt Resend-testdomene, ikke for produksjon!)" : ""
          }`,
        );
      } else {
        setTestEmailResult(`❌ Avvist av leverandøren: ${j.error}`);
      }
    } catch (e) {
      setTestEmailResult(`❌ ${e instanceof Error ? e.message : "Ukjent feil"}`);
    } finally {
      setTestEmailBusy(false);
    }
  }

  async function sendTestSms() {
    setTestSmsBusy(true);
    setTestSmsResult(null);
    try {
      const res = await fetch("/api/settings/communication/test-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testSmsTo }),
      });
      const j = await res.json();
      if (!j.configured) {
        setTestSmsResult(`❌ ${j.error}`);
      } else if (j.ok) {
        setTestSmsResult(`✅ Sendt via ${j.provider} (ref: ${j.provider_ref ?? "–"})`);
      } else {
        setTestSmsResult(`❌ Avvist av leverandøren (${j.provider}): ${j.error}`);
      }
    } catch (e) {
      setTestSmsResult(`❌ ${e instanceof Error ? e.message : "Ukjent feil"}`);
    } finally {
      setTestSmsBusy(false);
    }
  }

  async function runDispatchNow() {
    setDispatchBusy(true);
    setDispatchResult(null);
    try {
      const res = await fetch("/api/reminders/sms/dispatch", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        setDispatchResult(`❌ ${j.error}`);
      } else {
        setDispatchResult(
          `Behandlet ${j.processed}: ${j.sent} sendt, ${j.retried} utsatt for nytt forsøk, ${j.failed} mislyktes, ${j.skipped} hoppet over.`,
        );
      }
    } finally {
      setDispatchBusy(false);
    }
  }

  const previewCustomer = useMemo(() => {
    const vars = buildReminderVars({
      customerName: "Kari Nordmann",
      agentName: "Ola Selger",
      startsAtIso: new Date(Date.now() + 26 * 3600_000).toISOString(),
      location: "Kontoret",
      orgName: form.email_from_name || "Bedriften",
      timeZone: form.timezone,
    });
    return renderReminderSms(form.sms_template_customer, "customer", vars);
  }, [form.sms_template_customer, form.email_from_name, form.timezone]);

  const previewAgent = useMemo(() => {
    const vars = buildReminderVars({
      customerName: "Kari Nordmann",
      agentName: "Ola Selger",
      startsAtIso: new Date(Date.now() + 26 * 3600_000).toISOString(),
      location: "Kontoret",
      orgName: form.email_from_name || "Bedriften",
      timeZone: form.timezone,
    });
    return renderReminderSms(form.sms_template_agent, "agent", vars);
  }, [form.sms_template_agent, form.email_from_name, form.timezone]);

  const domainMismatch =
    form.email_from_address &&
    domainStatus?.configured_domain &&
    !domainStatus.configured_domain_verified;

  return (
    <div className="space-y-6">
      {/* Status-badges */}
      <div className="flex flex-wrap gap-2">
        <ConfigBadge label="E-post" configured={emailConfigured} />
        <ConfigBadge label={`SMS (${smsProviderId})`} configured={smsConfigured} />
      </div>

      {/* E-post */}
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-bold text-slate-900">E-post</h2>
        <p className="text-sm text-slate-500">
          Send fra et eget, verifisert domene — aldri Resends delte
          test-domene i produksjon. API-nøkkelen (<code>RESEND_API_KEY</code>)
          settes som miljøvariabel, ikke her.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Avsendernavn">
            <input
              value={form.email_from_name}
              onChange={(e) => set("email_from_name", e.target.value)}
              placeholder="Salgssentral"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </Field>
          <Field label="Avsenderadresse (eget domene)">
            <input
              value={form.email_from_address}
              onChange={(e) => set("email_from_address", e.target.value)}
              placeholder="post@dittfirma.no"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </Field>
          <Field label="Svaradresse (overvåket)">
            <input
              value={form.email_reply_to}
              onChange={(e) => set("email_reply_to", e.target.value)}
              placeholder="salg@dittfirma.no"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </Field>
          <Field label="Lenkedomene (valgfritt eget HTTPS-domene)">
            <input
              value={form.email_link_domain}
              onChange={(e) => set("email_link_domain", e.target.value)}
              placeholder="lenker.dittfirma.no"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </Field>
        </div>

        {domainMismatch && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠ Avsenderdomenet «{domainStatus?.configured_domain}» er ikke verifisert hos
            e-postleverandøren ennå — e-post herfra vil trolig havne i søppelpost.
          </p>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              SPF / DKIM / DMARC-status
            </h3>
            <button
              onClick={loadDomainStatus}
              disabled={domainLoading}
              className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
            >
              {domainLoading ? "Oppdaterer …" : "Oppdater"}
            </button>
          </div>
          {!emailConfigured && (
            <p className="text-sm text-slate-400">
              Krever konfigurering: RESEND_API_KEY er ikke satt.
            </p>
          )}
          {emailConfigured && domainStatus?.error && (
            <p className="text-sm text-red-600">{domainStatus.error}</p>
          )}
          {emailConfigured && !domainStatus?.error && (domainStatus?.domains.length ?? 0) === 0 && (
            <p className="text-sm text-slate-400">
              Ingen domener registrert i Resend ennå. Legg til domenet deres i
              Resend-dashbordet først.
            </p>
          )}
          {domainStatus?.domains.map((d) => (
            <div key={d.id} className="mb-2 rounded-lg border border-slate-200 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-slate-800">{d.name}</span>
                <StatusPill status={d.status} />
              </div>
              <div className="space-y-1">
                {d.records.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {r.record} ({r.type}) — <span className="font-mono">{r.name}</span>
                    </span>
                    <StatusPill status={r.status} small />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                DNS-oppføringene over må legges inn hos domeneleverandøren deres (der dere
                administrerer domenet), ikke i CRM-et.
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <input
            value={testEmailTo}
            onChange={(e) => setTestEmailTo(e.target.value)}
            placeholder="test@dittfirma.no"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 max-w-xs"
          />
          <button
            onClick={sendTestEmail}
            disabled={testEmailBusy || !testEmailTo.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {testEmailBusy ? "Sender …" : "Send test-e-post"}
          </button>
          {testEmailResult && <span className="text-sm">{testEmailResult}</span>}
        </div>
      </section>

      {/* SMS + avtalepåminnelser */}
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-bold text-slate-900">SMS og avtalepåminnelser</h2>
        <p className="text-sm text-slate-500">
          Leverandørnøkler (<code>SVEVE_USER</code>/<code>SVEVE_PASSWORD</code>) settes som
          miljøvariabler. Tidspunkt beregnes i valgt tidssone (standard Europe/Oslo).
        </p>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={form.sms_reminders_enabled}
            onChange={(e) => set("sms_reminders_enabled", e.target.checked)}
          />
          Send automatiske SMS-påminnelser om avtaler
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Avsendernavn (SMS)">
            <input
              value={form.sms_from_name}
              onChange={(e) => set("sms_from_name", e.target.value)}
              placeholder="Firma"
              maxLength={11}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </Field>
          <Field label="Standard telefonnummer (fra)">
            <input
              value={form.sms_default_phone}
              onChange={(e) => set("sms_default_phone", e.target.value)}
              placeholder="+47..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </Field>
          <Field label="Tidssone">
            <input
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </Field>
          <Field label="Send påminnelse til">
            <select
              value={form.sms_reminder_recipients}
              onChange={(e) => set("sms_reminder_recipients", e.target.value as SmsReminderRecipients)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="both">Kunde og selger</option>
              <option value="customer">Kun kunde</option>
              <option value="agent">Kun selger</option>
            </select>
          </Field>
          <Field label="Timer før avtalen (komma-separert)">
            <input
              value={form.sms_reminder_offsets_hours}
              onChange={(e) => set("sms_reminder_offsets_hours", e.target.value)}
              placeholder="24, 1"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Field label="Mal — kunde">
              <textarea
                value={form.sms_template_customer}
                onChange={(e) => set("sms_template_customer", e.target.value)}
                rows={3}
                placeholder="Hei {{kundenavn}}! Påminnelse om avtale med {{selgernavn}} ..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-y"
              />
            </Field>
            <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              Forhåndsvisning: {previewCustomer}
            </p>
          </div>
          <div>
            <Field label="Mal — selger">
              <textarea
                value={form.sms_template_agent}
                onChange={(e) => set("sms_template_agent", e.target.value)}
                rows={3}
                placeholder="Påminnelse: avtale med {{kundenavn}} ..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 resize-y"
              />
            </Field>
            <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
              Forhåndsvisning: {previewAgent}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Variabler: {"{{kundenavn}}"} {"{{selgernavn}}"} {"{{dato}}"} {"{{klokkeslett}}"}{" "}
          {"{{sted}}"} {"{{bedrift}}"}
        </p>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <input
            value={testSmsTo}
            onChange={(e) => setTestSmsTo(e.target.value)}
            placeholder="+47..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 max-w-xs"
          />
          <button
            onClick={sendTestSms}
            disabled={testSmsBusy || !testSmsTo.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {testSmsBusy ? "Sender …" : "Send test-SMS"}
          </button>
          {testSmsResult && <span className="text-sm">{testSmsResult}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <button onClick={runDispatchNow} disabled={dispatchBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Icon name="send" size={14} />
            {dispatchBusy ? "Kjører …" : "Send forfalte påminnelser nå"}
          </button>
          {dispatchResult && <span className="text-sm text-slate-600">{dispatchResult}</span>}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Lagrer …" : "Lagre kommunikasjonsoppsett"}
        </button>
        {message && (
          <span className={message.ok ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
            {message.text}
          </span>
        )}
      </div>

      {/* Endringslogg */}
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          Siste endringer
        </h2>
        {auditLog.length === 0 ? (
          <p className="text-sm text-slate-400">Ingen endringer registrert ennå.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-slate-600">
            {auditLog.map((a) => (
              <li key={a.id} className="flex justify-between gap-4">
                <span>
                  <span className="font-medium text-slate-800">{a.actor_name}</span> —{" "}
                  {a.summary}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {new Date(a.created_at).toLocaleString("nb-NO")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ConfigBadge({ label, configured }: { label: string; configured: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        configured ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      <Icon name={configured ? "check" : "close"} size={12} />
      {label}: {configured ? "Konfigurert" : "Krever konfigurering"}
    </span>
  );
}

function StatusPill({ status, small }: { status: string; small?: boolean }) {
  const colors: Record<string, string> = {
    verified: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    not_started: "bg-slate-100 text-slate-500",
    failed: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    verified: "Verifisert",
    pending: "Venter",
    not_started: "Mangler",
    failed: "Feilet",
  };
  return (
    <span
      className={`rounded-full font-semibold ${small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"} ${
        colors[status] ?? "bg-slate-100 text-slate-500"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}
