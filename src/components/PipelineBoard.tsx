"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { DealStage } from "@/lib/types";
import type { DealWithCustomer } from "@/app/(dashboard)/pipeline/page";
import { DEAL_STAGES, DEAL_STAGE_LABELS, DEAL_STAGE_COLORS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";

// Enkel Kanban-pipeline. Kort flyttes mellom steg med piler (fungerer godt på
// både desktop og mobil). Summerer beløp per kolonne.
export default function PipelineBoard({
  initialDeals,
}: {
  initialDeals: DealWithCustomer[];
}) {
  const supabase = createClient();
  const [deals, setDeals] = useState<DealWithCustomer[]>(initialDeals);

  async function move(deal: DealWithCustomer, stage: DealStage) {
    const patch: Partial<DealWithCustomer> = { stage };
    if (stage === "tilbud_sendt" && !deal.offer_sent_at)
      patch.offer_sent_at = new Date().toISOString();
    if (stage === "akseptert" && !deal.offer_accepted_at)
      patch.offer_accepted_at = new Date().toISOString();

    await supabase.from("deals").update(patch).eq("id", deal.id);
    setDeals((ds) => ds.map((d) => (d.id === deal.id ? { ...d, ...patch } : d)));
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {DEAL_STAGES.map((stage) => {
        const stageDeals = deals.filter((d) => d.stage === stage);
        const total = stageDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
        const stageIndex = DEAL_STAGES.indexOf(stage);

        return (
          <div key={stage} className="rounded-xl bg-slate-200/60 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-700">
                {DEAL_STAGE_LABELS[stage]}
              </h2>
              <span className="text-xs text-slate-500">
                {stageDeals.length} · {formatCurrency(total)}
              </span>
            </div>

            <div className="space-y-2">
              {stageDeals.map((d) => (
                <div
                  key={d.id}
                  className={`rounded-lg border-l-4 bg-white p-3 shadow-sm ${DEAL_STAGE_COLORS[stage]}`}
                >
                  <Link
                    href={`/customers/${d.customer_id}`}
                    className="text-sm font-medium text-slate-800 hover:underline"
                  >
                    {d.customer_name}
                  </Link>
                  <p className="text-xs text-slate-500">{d.title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {formatCurrency(d.amount, d.currency)}
                  </p>
                  <div className="mt-2 flex justify-between">
                    <button
                      disabled={stageIndex === 0}
                      onClick={() => move(d, DEAL_STAGES[stageIndex - 1])}
                      className="text-xs text-slate-400 hover:text-slate-700 disabled:invisible"
                    >
                      ← Flytt
                    </button>
                    <button
                      disabled={stageIndex === DEAL_STAGES.length - 1}
                      onClick={() => move(d, DEAL_STAGES[stageIndex + 1])}
                      className="text-xs text-slate-400 hover:text-slate-700 disabled:invisible"
                    >
                      Flytt →
                    </button>
                  </div>
                </div>
              ))}
              {stageDeals.length === 0 && (
                <p className="py-4 text-center text-xs text-slate-400">Tomt</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
