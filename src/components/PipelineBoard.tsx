"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DealStage } from "@/lib/types";
import type { DealWithCustomer } from "@/app/(dashboard)/pipeline/page";
import { DEAL_STAGES, DEAL_STAGE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import Icon from "./Icon";

// Kanban-pipeline med drag-and-drop. Dra kortene mellom kolonnene, eller bruk
// pilene (nyttig på touch). Summerer beløp per kolonne.
export default function PipelineBoard({
  initialDeals,
}: {
  initialDeals: DealWithCustomer[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [deals, setDeals] = useState<DealWithCustomer[]>(initialDeals);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<DealStage | null>(null);
  // Kort feiring når et tilbud aksepteres — den eneste virkelige
  // milepælen i pipelinen. Nullstilles selv (1600ms, matcher animasjonen).
  const [justWonId, setJustWonId] = useState<string | null>(null);
  // Skiller et ekte klikk fra slutten av en dra-operasjon, slik at man ikke
  // navigerer til kundesiden rett etter å ha dratt et kort.
  const draggedRef = useRef(false);

  function openCustomer(deal: DealWithCustomer) {
    if (draggedRef.current) return;
    router.push(`/customers/${deal.customer_id}`);
  }

  async function move(deal: DealWithCustomer, stage: DealStage) {
    if (deal.stage === stage) return;
    const patch: Partial<DealWithCustomer> = { stage };
    if (stage === "tilbud_sendt" && !deal.offer_sent_at)
      patch.offer_sent_at = new Date().toISOString();
    const isNewWin = stage === "akseptert" && !deal.offer_accepted_at;
    if (isNewWin) patch.offer_accepted_at = new Date().toISOString();

    // Optimistisk oppdatering.
    setDeals((ds) => ds.map((d) => (d.id === deal.id ? { ...d, ...patch } : d)));
    await supabase.from("deals").update(patch).eq("id", deal.id);

    if (isNewWin) {
      setJustWonId(deal.id);
      setTimeout(() => setJustWonId((id) => (id === deal.id ? null : id)), 1600);
    }
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
                  role="button"
                  tabIndex={0}
                  draggable
                  onClick={() => openCustomer(d)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/customers/${d.customer_id}`);
                    }
                  }}
                  onDragStart={() => {
                    draggedRef.current = true;
                    setDraggingId(d.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverStage(null);
                    // Nullstill etter at et eventuelt klikk-event har passert.
                    setTimeout(() => (draggedRef.current = false), 50);
                  }}
                  className={`group relative cursor-pointer overflow-hidden rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200/70 transition hover:shadow-soft hover:ring-brand-200 active:cursor-grabbing ${
                    draggingId === d.id ? "opacity-40" : ""
                  }`}
                >
                  {justWonId === d.id && (
                    <div className="animate-deal-won pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                      <Icon name="check" size={18} />
                      <span className="text-sm font-bold">Vunnet!</span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-brand-700">
                      {d.customer_name}
                    </span>
                    <span className="mt-0.5 shrink-0 text-slate-300 transition group-hover:text-brand-500">
                      →
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{d.title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {formatCurrency(d.amount, d.currency)}
                  </p>
                  <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
                    <button
                      disabled={stageIndex === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        move(d, DEAL_STAGES[stageIndex - 1]);
                      }}
                      className="text-xs text-slate-400 hover:text-slate-700 disabled:invisible"
                    >
                      ← Flytt
                    </button>
                    <button
                      disabled={stageIndex === DEAL_STAGES.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        move(d, DEAL_STAGES[stageIndex + 1]);
                      }}
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
