"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { DealStage } from "@/lib/types";
import type { DealWithCustomer } from "@/app/(dashboard)/pipeline/page";
import { DEAL_STAGES, DEAL_STAGE_LABELS, DEAL_STAGE_COLORS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";

// Kanban-pipeline med drag-and-drop. Dra kortene mellom kolonnene, eller bruk
// pilene (nyttig på touch). Summerer beløp per kolonne.
export default function PipelineBoard({
  initialDeals,
}: {
  initialDeals: DealWithCustomer[];
}) {
  const supabase = createClient();
  const [deals, setDeals] = useState<DealWithCustomer[]>(initialDeals);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<DealStage | null>(null);

  async function move(deal: DealWithCustomer, stage: DealStage) {
    if (deal.stage === stage) return;
    const patch: Partial<DealWithCustomer> = { stage };
    if (stage === "tilbud_sendt" && !deal.offer_sent_at)
      patch.offer_sent_at = new Date().toISOString();
    if (stage === "akseptert" && !deal.offer_accepted_at)
      patch.offer_accepted_at = new Date().toISOString();

    // Optimistisk oppdatering.
    setDeals((ds) => ds.map((d) => (d.id === deal.id ? { ...d, ...patch } : d)));
    await supabase.from("deals").update(patch).eq("id", deal.id);
  }

  function onDrop(stage: DealStage) {
    setOverStage(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const deal = deals.find((d) => d.id === id);
    if (deal) move(deal, stage);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {DEAL_STAGES.map((stage) => {
        const stageDeals = deals.filter((d) => d.stage === stage);
        const total = stageDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
        const stageIndex = DEAL_STAGES.indexOf(stage);
        const isOver = overStage === stage;

        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStage(stage);
            }}
            onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
            onDrop={() => onDrop(stage)}
            className={`rounded-xl p-3 transition ${
              isOver ? "bg-slate-300 ring-2 ring-slate-400" : "bg-slate-200/60"
            }`}
          >
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
                  draggable
                  onDragStart={() => setDraggingId(d.id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverStage(null);
                  }}
                  className={`cursor-grab rounded-lg border-l-4 bg-white p-3 shadow-sm active:cursor-grabbing ${
                    DEAL_STAGE_COLORS[stage]
                  } ${draggingId === d.id ? "opacity-40" : ""}`}
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
                <p className="py-6 text-center text-xs text-slate-400">
                  Dra kort hit
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
