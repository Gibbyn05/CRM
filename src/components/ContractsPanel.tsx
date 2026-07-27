"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Contract,
  ContractChannel,
  ContractEvent,
  ContractTemplate,
  Customer,
  Deal,
  DealItem,
} from "@/lib/types";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  CONTRACT_EXPIRED_LABEL,
  CONTRACT_EXPIRED_COLOR,
  SIGNING_EVENT_LABELS,
} from "@/lib/constants";
import { formatDateTime, contractDisplayStatus } from "@/lib/format";
import { renderTemplateHtml, renderTemplateText, type TemplateContext } from "@/lib/templates";
import Icon from "./Icon";

// Tilbudsflyt: velg ev. tilbud (deal) + kontrakt-/e-postmal, generer en
// forhåndsvisning fra malen (dynamiske felt fylt ut), tillat manuell
// redigering, og send med en sikker signeringslenke (/sign/[token]).
// Under vises status (sendt/åpnet/signert/avslått/utløpt) + full
// revisjonslogg per kontrakt, og en "send på nytt"-knapp for aktive lenker.
export default function ContractsPanel({
  customer,
  initialContracts,
  deals,
  itemsByDeal,
  templates,
  advisorName,
}: {
  customer: Customer;
  initialContracts: Contract[];
  deals: Deal[];
  itemsByDeal: Record<string, DealItem[]>;
  templates: ContractTemplate[];
  advisorName?: string;
}) {
  const supabase = createClient();
  const [contracts, setContracts] = useState<Contract[]>(initialContracts);
  const [channel, setChannel] = useState<ContractChannel>("email");
  const [recipient, setRecipient] = useState(customer.email ?? "");
  const [dealId, setDealId] = useState<string>(deals[0]?.id ?? "");
  const [contractTemplateId, setContractTemplateId] = useState("");
  const [emailTemplateId, setEmailTemplateId] = useState("");
  const [subject, setSubject] = useState(`Tilbud fra Salgssentral – ${customer.name}`);
  const [documentBody, setDocumentBody] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, ContractEvent[] | "loading">>({});

  const contractTemplates = templates.filter((t) => t.type === "contract");
  const emailTemplates = templates.filter((t) => t.type === "email");

  const context = useMemo<TemplateContext>(() => {
    const items = dealId ? itemsByDeal[dealId] ?? [] : [];
    return {
      customer_name: customer.name,
      org_number: customer.org_number,
      company_city: customer.city,
      advisor_name: advisorName ?? null,
      valid_until: deals.find((d) => d.id === dealId)?.valid_until ?? null,
      items,
    };
  }, [dealId, itemsByDeal, customer, deals, advisorName]);

  function generateFromTemplates() {
    const ct = contractTemplates.find((t) => t.id === contractTemplateId);
    if (ct) setDocumentBody(renderTemplateHtml(ct.body, context));
    if (channel === "email") {
      const et = emailTemplates.find((t) => t.id === emailTemplateId);
      if (et) {
        if (et.subject) setSubject(renderTemplateText(et.subject, context));
        setEmailBody(renderTemplateText(et.body, context));
      }
    }
  }

  async function draftWithAi() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/contracts/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: customer.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Kunne ikke lage forslag.");
      setEmailBody(j.message ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukjent feil.");
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    setError(null);
    if (!recipient.trim()) {
      setError("Mottaker (e-post/mobil) er påkrevd.");
      return;
    }
    if (!documentBody.trim()) {
      setError(
        "Kontraktinnhold mangler – velg en mal og trykk «Generer», eller skriv innholdet manuelt.",
      );
      return;
    }
    setSending(true);
    const res = await fetch("/api/contracts/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customer.id,
        deal_id: dealId || undefined,
        channel,
        recipient: recipient.trim(),
        contract_template_id: contractTemplateId || undefined,
        email_template_id: channel === "email" ? emailTemplateId || undefined : undefined,
        subject: channel === "email" ? subject.trim() : undefined,
        document_body: documentBody,
        email_body: channel === "email" ? emailBody.trim() || undefined : undefined,
        sms_message: channel === "sms" ? smsMessage.trim() || undefined : undefined,
      }),
    });
    setSending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Kunne ikke sende kontrakt.");
      return;
    }
    const { contract } = await res.json();
    setContracts((c) => [contract as Contract, ...c]);
    setDocumentBody("");
    setEmailBody("");
    setSmsMessage("");
  }

  async function resend(c: Contract) {
    setResendingId(c.id);
    setError(null);
    const res = await fetch(`/api/contracts/${c.id}/resend`, { method: "POST" });
    setResendingId(null);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(j.error ?? "Kunne ikke sende på nytt.");
      return;
    }
    setContracts((cs) => cs.map((x) => (x.id === c.id ? (j.contract as Contract) : x)));
  }

  async function toggleEvents(c: Contract) {
    if (events[c.id]) {
      setEvents((e) => {
        const next = { ...e };
        delete next[c.id];
        return next;
      });
      return;
    }
    setEvents((e) => ({ ...e, [c.id]: "loading" }));
    const { data } = await supabase
      .from("contract_events")
      .select("*")
      .eq("contract_id", c.id)
      .order("occurred_at", { ascending: true });
    setEvents((e) => ({ ...e, [c.id]: (data as ContractEvent[]) ?? [] }));
  }

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-lg font-bold text-slate-900">Tilbud / kontrakt</h2>

      <div className="mb-4 space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Uten tilbud (fritekst)</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} {itemsByDeal[d.id]?.length ? `(${itemsByDeal[d.id].length} produkt${itemsByDeal[d.id].length > 1 ? "er" : ""})` : ""}
              </option>
            ))}
          </select>
          <select
            value={contractTemplateId}
            onChange={(e) => setContractTemplateId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Ingen kontraktmal (skriv manuelt)</option>
            {contractTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <select
            value={channel}
            onChange={(e) => {
              const ch = e.target.value as ContractChannel;
              setChannel(ch);
              setRecipient(ch === "email" ? customer.email ?? "" : customer.phone ?? "");
            }}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="email">E-post</option>
            <option value="sms">SMS</option>
          </select>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={channel === "email" ? "E-postadresse" : "Mobilnummer"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {channel === "email" && (
          <select
            value={emailTemplateId}
            onChange={(e) => setEmailTemplateId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Ingen e-postmal (standardtekst)</option>
            {emailTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={generateFromTemplates}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
        >
          <Icon name="file-text" size={13} />
          Generer forhåndsvisning fra mal
        </button>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Kontraktinnhold (det kunden ser og signerer)
          </label>
          <div
            className="thin-scroll mb-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600"
            dangerouslySetInnerHTML={{
              __html: documentBody || "<p style='color:#94a3b8'>(ingen forhåndsvisning ennå)</p>",
            }}
          />
          <textarea
            value={documentBody}
            onChange={(e) => setDocumentBody(e.target.value)}
            rows={4}
            placeholder="HTML-innhold for kontrakten (bruk «Generer» over, eller skriv/lim inn manuelt)."
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {channel === "email" ? (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500">Emne + e-posttekst</label>
              <button
                type="button"
                onClick={draftWithAi}
                disabled={drafting}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
              >
                <Icon name="upload" size={13} />
                {drafting ? "Lager forslag …" : "Foreslå tekst med AI"}
              </button>
            </div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Emnefelt"
              className="mb-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={4}
              placeholder="La stå tom for standardtekst, eller skriv/generer en egen melding."
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        ) : (
          <textarea
            value={smsMessage}
            onChange={(e) => setSmsMessage(e.target.value)}
            rows={2}
            placeholder="SMS-tekst (la stå tom for standardtekst med signeringslenke)."
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={send}
          disabled={sending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {sending ? "Sender …" : "Send tilbud"}
        </button>
      </div>

      <ul className="space-y-2">
        {contracts.map((c) => {
          const displayStatus = contractDisplayStatus(c);
          const isExpired = displayStatus === "expired";
          const canResend = c.status !== "signed" && c.status !== "declined";
          const evs = events[c.id];
          return (
            <li key={c.id} className="rounded-lg border border-slate-200 p-2 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-slate-700">
                    {c.channel === "email" ? "E-post" : "SMS"}
                  </span>{" "}
                  <span className="text-slate-500">{c.recipient}</span>
                  <div className="text-xs text-slate-400">
                    {formatDateTime(c.sent_at ?? c.created_at)}
                    {c.resend_count > 0 && ` · sendt på nytt ${c.resend_count}×`}
                  </div>
                </div>
                <StatusBadge status={displayStatus} />
              </div>

              {c.status === "declined" && c.declined_reason && (
                <p className="mt-1 text-xs text-red-600">«{c.declined_reason}»</p>
              )}
              {c.status === "signed" && c.signed_by_name && (
                <p className="mt-1 text-xs text-green-600">
                  Signert av {c.signed_by_name} – {formatDateTime(c.signed_at)}
                </p>
              )}

              <div className="mt-1.5 flex items-center gap-3">
                <button
                  onClick={() => toggleEvents(c)}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  {evs ? "Skjul historikk" : "Vis historikk"}
                </button>
                {canResend && c.signing_token && (
                  <button
                    onClick={() => resend(c)}
                    disabled={resendingId === c.id}
                    className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                  >
                    {resendingId === c.id ? "Sender …" : isExpired ? "Send på nytt" : "Påminn"}
                  </button>
                )}
              </div>

              {evs && evs !== "loading" && (
                <ol className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                  {evs.map((ev) => (
                    <li key={ev.id} className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {SIGNING_EVENT_LABELS[ev.event_type]}
                        {ev.ip && <span className="text-slate-400"> · {ev.ip}</span>}
                      </span>
                      <span className="text-slate-400">{formatDateTime(ev.occurred_at)}</span>
                    </li>
                  ))}
                  {evs.length === 0 && <li className="text-xs text-slate-400">Ingen hendelser.</li>}
                </ol>
              )}
              {evs === "loading" && <p className="mt-2 text-xs text-slate-400">Henter …</p>}
            </li>
          );
        })}
        {contracts.length === 0 && (
          <li className="text-sm text-slate-400">Ingen kontrakter sendt.</li>
        )}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: Contract["status"] | "expired" }) {
  if (status === "expired") {
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONTRACT_EXPIRED_COLOR}`}>
        {CONTRACT_EXPIRED_LABEL}
      </span>
    );
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONTRACT_STATUS_COLORS[status]}`}>
      {CONTRACT_STATUS_LABELS[status]}
    </span>
  );
}
