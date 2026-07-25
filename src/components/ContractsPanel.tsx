"use client";

import { useState } from "react";
import type { Contract, ContractChannel, Customer } from "@/lib/types";
import { CONTRACT_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import Icon from "./Icon";

// Kontrakt-utsendelse via e-post/SMS direkte fra kundekortet, med status-
// sporing (sendt / åpnet / signert). Selve utsendelsen håndteres server-side
// av /api/contracts/send.
export default function ContractsPanel({
  customer,
  initialContracts,
}: {
  customer: Customer;
  initialContracts: Contract[];
}) {
  const [contracts, setContracts] = useState<Contract[]>(initialContracts);
  const [channel, setChannel] = useState<ContractChannel>("email");
  const [recipient, setRecipient] = useState(customer.email ?? "");
  const [message, setMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setMessage(j.message ?? "");
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
    setSending(true);
    const res = await fetch("/api/contracts/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customer.id,
        channel,
        recipient: recipient.trim(),
        message: channel === "email" ? message.trim() || undefined : undefined,
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
  }

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-lg font-bold text-slate-900">Kontrakt</h2>

      <div className="mb-4 space-y-2">
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
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500">
                Melding i e-posten (valgfritt)
              </label>
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
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="La stå tom for standardtekst, eller skriv/generer en egen melding."
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={send}
          disabled={sending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {sending ? "Sender …" : "Send kontrakt"}
        </button>
      </div>

      <ul className="space-y-2">
        {contracts.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm"
          >
            <div>
              <span className="font-medium text-slate-700">
                {c.channel === "email" ? "E-post" : "SMS"}
              </span>{" "}
              <span className="text-slate-500">{c.recipient}</span>
              <div className="text-xs text-slate-400">
                {formatDateTime(c.sent_at ?? c.created_at)}
              </div>
            </div>
            <StatusBadge status={c.status} />
          </li>
        ))}
        {contracts.length === 0 && (
          <li className="text-sm text-slate-400">Ingen kontrakter sendt.</li>
        )}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: Contract["status"] }) {
  const colors: Record<Contract["status"], string> = {
    draft: "bg-slate-200 text-slate-700",
    sent: "bg-blue-100 text-blue-700",
    opened: "bg-amber-100 text-amber-700",
    signed: "bg-green-100 text-green-700",
    declined: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}>
      {CONTRACT_STATUS_LABELS[status]}
    </span>
  );
}
