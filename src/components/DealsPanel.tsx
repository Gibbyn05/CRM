"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Deal, DealStage } from "@/lib/types";
import { DEAL_STAGES, DEAL_STAGE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";

// Salgsstatus per kunde: viser tilbud sendt / akseptert og lar selger flytte
// dealen gjennom pipeline-stegene direkte på kundekortet.
export default function DealsPanel({
  customerId,
  initialDeals,
}: {
  customerId: string;
  initialDeals: Deal[];
}) {
  const supabase = createClient();
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");

  async function addDeal() {
    if (!title.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("deals")
      .insert({
        customer_id: customerId,
        agent_id: user?.id ?? null,
        title: title.trim(),
        amount: amount ? Number(amount) : null,
        stage: "ringt",
      })
      .select("*")
      .single();
    if (data) setDeals((d) => [data as Deal, ...d]);
    setTitle("");
    setAmount("");
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
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-bold text-slate-900">Salg / tilbud</h2>

      <div className="mb-4 space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tittel (f.eks. Årsavtale)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Beløp (NOK)"
            type="number"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            onClick={addDeal}
            className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Legg til
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {deals.map((d) => (
          <li key={d.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">{d.title}</span>
              <span className="text-sm text-slate-600">
                {formatCurrency(d.amount, d.currency)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {DEAL_STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStage(d, s)}
                  className={`rounded px-2 py-1 text-xs ${
                    d.stage === s
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {DEAL_STAGE_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-3 text-xs text-slate-400">
              <span>{d.offer_sent_at ? "✓ Tilbud sendt" : "Tilbud ikke sendt"}</span>
              <span>{d.offer_accepted_at ? "✓ Akseptert" : ""}</span>
            </div>
          </li>
        ))}
        {deals.length === 0 && (
          <li className="text-sm text-slate-400">Ingen tilbud registrert.</li>
        )}
      </ul>
    </div>
  );
}
