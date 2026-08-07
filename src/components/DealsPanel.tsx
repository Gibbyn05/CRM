"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Deal, DealStage } from "@/lib/types";
import { DEAL_STAGES, DEAL_STAGE_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import Icon from "./Icon";

// Salg per kunde: «Nytt salg» åpner den fulle salgsveiviseren (produktkatalog →
// handlekurv → kontrakt → oversikt) med kunden forhåndsvalgt, og under vises
// alle tidligere tilbud for kunden.
export default function DealsPanel({
  customerId,
  deals,
  setDeals,
}: {
  customerId: string;
  deals: Deal[];
  setDeals: React.Dispatch<React.SetStateAction<Deal[]>>;
}) {
  const supabase = createClient();
  const [invoicingId, setInvoicingId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendToSigning(deal: Deal) {
    setSigningId(deal.id);
    setMsg(null);
    try {
      const res = await fetch("/api/contracts/sign-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: deal.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error ?? "Kunne ikke sende til signering.");
      } else {
        setMsg(`Avtale sendt til signering på ${json.recipient}.`);
      }
    } catch {
      setMsg("Kunne ikke sende til signering.");
    } finally {
      setSigningId(null);
    }
  }

  async function sendInvoice(deal: Deal) {
    setInvoicingId(deal.id);
    setMsg(null);
    try {
      const res = await fetch("/api/salg/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: deal.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.error ?? "Kunne ikke opprette faktura.");
      } else {
        setMsg("Fakturautkast opprettet i Fiken – åpner Fiken …");
        if (json.fiken_url) window.open(json.fiken_url, "_blank");
      }
    } catch {
      setMsg("Kunne ikke opprette faktura.");
    } finally {
      setInvoicingId(null);
    }
  }

  async function setStage(deal: Deal, stage: DealStage) {
    const patch: Partial<Deal> = { stage };
    if (stage === "tilbud_sendt" && !deal.offer_sent_at) {
      patch.offer_sent_at = new Date().toISOString();
    }
    if (stage === "akseptert" && !deal.offer_accepted_at) {
      patch.offer_accepted_at = new Date().toISOString();
    }
    await supabase.from("deals").update(patch).eq("id", deal.id);
    setDeals((ds) => ds.map((d) => (d.id === deal.id ? { ...d, ...patch } : d)));
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Salg / tilbud</h2>
          <p className="text-xs text-slate-400">
            Tidligere tilbud sendt til kunden.
          </p>
        </div>
        <Link
          href={`/salg/ny?customer=${customerId}`}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Icon name="plus" size={16} />
          Nytt salg
        </Link>
      </div>

      {msg && <p className="mb-3 text-xs text-slate-500">{msg}</p>}

      <ul className="space-y-3">
        {deals.map((d) => (
          <li key={d.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium text-slate-800">{d.title}</span>
                {d.offer_sent_at && (
                  <p className="text-2xs text-slate-400">
                    Sendt {formatDate(d.offer_sent_at)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-semibold text-slate-700">
                  {formatCurrency(d.amount, d.currency)}
                </span>
                <button
                  onClick={() => sendToSigning(d)}
                  disabled={signingId === d.id}
                  className="whitespace-nowrap rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                >
                  {signingId === d.id ? "Sender …" : "Send til signering"}
                </button>
                <button
                  onClick={() => sendInvoice(d)}
                  disabled={invoicingId === d.id}
                  className="whitespace-nowrap rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  {invoicingId === d.id ? "Sender …" : "Send faktura"}
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {DEAL_STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStage(d, s)}
                  className={`rounded px-2 py-1 text-xs ${
                    d.stage === s
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {DEAL_STAGE_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-3 text-xs text-slate-400">
              <span>
                {d.offer_sent_at ? "✓ Tilbud sendt" : "Tilbud ikke sendt"}
              </span>
              <span>{d.offer_accepted_at ? "✓ Akseptert" : ""}</span>
            </div>
          </li>
        ))}
        {deals.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
            Ingen tilbud ennå. Trykk «Nytt salg» for å lage det første.
          </li>
        )}
      </ul>
    </div>
  );
}
