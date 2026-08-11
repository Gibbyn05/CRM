"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Contract, ContractStatus, Deal, DealStage } from "@/lib/types";
import { DEAL_STAGES, DEAL_STAGE_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import Icon from "./Icon";

// Salg per kunde: «Nytt salg» åpner den fulle salgsveiviseren (produktkatalog →
// handlekurv → kontrakt → oversikt) med kunden forhåndsvalgt, og under vises
// alle tidligere tilbud for kunden – med signeringsstatus rett på tilbudet.
export default function DealsPanel({
  customerId,
  deals,
  setDeals,
  contracts,
}: {
  customerId: string;
  deals: Deal[];
  setDeals: React.Dispatch<React.SetStateAction<Deal[]>>;
  contracts: Contract[];
}) {
  const supabase = createClient();
  const [invoicingId, setInvoicingId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Nyeste kontraktstatus per tilbud (deal), fra databasen …
  const initialStatus = useMemo(() => {
    const status: Record<string, ContractStatus> = {};
    const at: Record<string, number> = {};
    for (const c of contracts) {
      if (!c.deal_id) continue;
      const t = new Date(c.sent_at ?? c.created_at).getTime();
      if (at[c.deal_id] === undefined || t >= at[c.deal_id]) {
        at[c.deal_id] = t;
        status[c.deal_id] = c.status;
      }
    }
    return status;
  }, [contracts]);
  // … med lokal overstyring når man nettopp sendte til signering.
  const [sentOverride, setSentOverride] = useState<Record<string, ContractStatus>>(
    {},
  );
  const contractStatus = { ...initialStatus, ...sentOverride };

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
        setSentOverride((s) => ({ ...s, [deal.id]: "sent" }));
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
                {contractStatus[d.id] && (
                  <div className="mt-1">
                    <ContractBadge status={contractStatus[d.id]} />
                  </div>
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

// Signeringsstatus på selve tilbudet: sendt → åpnet → signert.
function ContractBadge({ status }: { status: ContractStatus }) {
  const meta: Record<ContractStatus, { label: string; cls: string }> = {
    draft: { label: "Kladd", cls: "bg-slate-100 text-slate-600" },
    sent: { label: "Sendt til signering", cls: "bg-blue-100 text-blue-700" },
    opened: { label: "Åpnet av kunde", cls: "bg-amber-100 text-amber-700" },
    signed: { label: "Signert 🎉", cls: "bg-emerald-100 text-emerald-700" },
    declined: { label: "Avslått", cls: "bg-red-100 text-red-700" },
  };
  const m = meta[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
