"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Customer, DealStage } from "@/lib/types";
import type { DealWithCustomer } from "@/app/(dashboard)/pipeline/page";
import { DEAL_STAGES, DEAL_STAGE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import Avatar from "./Avatar";
import Icon from "./Icon";

// Farge + fremdrift pr. steg. Statiske klasser (trygge for Tailwind-purge).
const STAGE_STYLE: Record<
  DealStage,
  { text: string; dot: string; bar: string; tint: string; ring: string }
> = {
  ringt: {
    text: "text-indigo-700",
    dot: "bg-indigo-500",
    bar: "bg-indigo-500",
    tint: "bg-indigo-50/60",
    ring: "ring-indigo-200",
  },
  tilbud_sendt: {
    text: "text-amber-700",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    tint: "bg-amber-50/60",
    ring: "ring-amber-200",
  },
  akseptert: {
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    tint: "bg-emerald-50/60",
    ring: "ring-emerald-200",
  },
  tapt: {
    text: "text-rose-700",
    dot: "bg-rose-400",
    bar: "bg-rose-400",
    tint: "bg-rose-50/60",
    ring: "ring-rose-200",
  },
};

const STAGE_PROGRESS: Record<DealStage, number> = {
  ringt: 25,
  tilbud_sendt: 60,
  akseptert: 100,
  tapt: 0,
};

function daysInStage(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

// Kanban-pipeline med drag-and-drop, fargede kolonner og rike kort. Dra kort
// mellom kolonnene (eller bruk hover-pilene), klikk for å åpne kundekortet.
export default function PipelineBoard({
  initialDeals,
  customers,
  currentUserId,
  currentUserName,
}: {
  initialDeals: DealWithCustomer[];
  customers: Pick<Customer, "id" | "name">[];
  currentUserId: string;
  currentUserName: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [deals, setDeals] = useState<DealWithCustomer[]>(initialDeals);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<DealStage | null>(null);
  const [justWonId, setJustWonId] = useState<string | null>(null);
  const [createStage, setCreateStage] = useState<DealStage | null>(null);
  const draggedRef = useRef(false);

  // Vektet pipelineverdi over åpne avtaler (ekskl. tapt).
  const { weighted, openCount } = useMemo(() => {
    let w = 0;
    let n = 0;
    for (const d of deals) {
      if (d.stage === "tapt") continue;
      n += 1;
      w += (d.amount ?? 0) * (STAGE_PROGRESS[d.stage] / 100);
    }
    return { weighted: w, openCount: n };
  }, [deals]);

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
    patch.updated_at = new Date().toISOString();

    setDeals((ds) => ds.map((d) => (d.id === deal.id ? { ...d, ...patch } : d)));
    await supabase
      .from("deals")
      .update({ ...patch })
      .eq("id", deal.id);

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

  function onCreated(deal: DealWithCustomer) {
    setDeals((ds) => [deal, ...ds]);
    setCreateStage(null);
  }

  return (
    <div className="space-y-5">
      {/* Topp */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-700">
              {formatCurrency(weighted)}
            </span>{" "}
            vektet på tvers av {openCount} åpne avtaler · dra et kort for å endre
            steg
          </p>
        </div>
        <button
          onClick={() => setCreateStage(DEAL_STAGES[0])}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 sm:w-auto"
        >
          <Icon name="plus" size={16} />
          Ny avtale
        </button>
      </div>

      {/* Kanban-brett (horisontal scroll) */}
      <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 thin-scroll sm:mx-0 sm:gap-4 sm:px-0">
        {DEAL_STAGES.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage);
          const total = stageDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);
          const stageIndex = DEAL_STAGES.indexOf(stage);
          const isOver = overStage === stage;
          const st = STAGE_STYLE[stage];

          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={() => onDrop(stage)}
              className={`flex w-[82vw] max-w-[22rem] shrink-0 snap-start flex-col rounded-2xl sm:w-[300px] lg:w-[280px] ${st.tint} p-3 ring-1 transition ${
                isOver ? `${st.ring} ring-2` : "ring-slate-200/70"
              }`}
            >
              {/* Kolonnehode */}
              <div className="mb-3 flex items-start justify-between px-1">
                <div>
                  <h2 className={`flex items-center gap-2 font-bold ${st.text}`}>
                    <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                    {DEAL_STAGE_LABELS[stage]}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {stageDeals.length}{" "}
                    {stageDeals.length === 1 ? "avtale" : "avtaler"}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-700 tabular-nums">
                  {formatCurrency(total)}
                </span>
              </div>

              {/* Kort */}
              <div className="flex-1 space-y-2.5">
                {stageDeals.map((d) => {
                  const progress = STAGE_PROGRESS[d.stage];
                  const isNew = daysInStage(d.created_at) <= 7;
                  const days = daysInStage(d.updated_at);
                  return (
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
                        setTimeout(() => (draggedRef.current = false), 50);
                      }}
                      className={`group relative cursor-pointer overflow-hidden rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200/70 transition hover:shadow-soft hover:ring-slate-300 active:cursor-grabbing ${
                        draggingId === d.id ? "opacity-40" : ""
                      }`}
                    >
                      {justWonId === d.id && (
                        <div className="animate-deal-won pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                          <Icon name="check" size={18} />
                          <span className="text-sm font-bold">Vunnet!</span>
                        </div>
                      )}

                      {/* Tittel + evt. «Ny»-tag */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold leading-snug text-slate-800 group-hover:text-brand-700">
                          {d.title}
                        </span>
                        {isNew && (
                          <span className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-3xs font-semibold text-brand-600">
                            Ny
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {d.customer_name}
                      </p>

                      {/* Beløp + prosent */}
                      <div className="mt-2.5 flex items-end justify-between">
                        <span className="text-lg font-bold text-slate-900 tabular-nums">
                          {formatCurrency(d.amount, d.currency)}
                        </span>
                        <span className="text-xs font-medium text-slate-400 tabular-nums">
                          {progress}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${st.bar} transition-all`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      {/* Fot: eier + dager i steg + hover-piler */}
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                        <div className="flex items-center gap-1.5">
                          <Avatar name={d.owner_name || "?"} size={20} />
                          <span className="text-3xs font-medium text-slate-400">
                            {days === 0 ? "i dag" : `${days}d i steg`}
                          </span>
                        </div>
                        <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                          <button
                            disabled={stageIndex === 0}
                            aria-label="Flytt til forrige steg"
                            onClick={(e) => {
                              e.stopPropagation();
                              move(d, DEAL_STAGES[stageIndex - 1]);
                            }}
                            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:invisible"
                          >
                            <Icon name="chevron-left" size={15} />
                          </button>
                          <button
                            disabled={stageIndex === DEAL_STAGES.length - 1}
                            aria-label="Flytt til neste steg"
                            onClick={(e) => {
                              e.stopPropagation();
                              move(d, DEAL_STAGES[stageIndex + 1]);
                            }}
                            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:invisible"
                          >
                            <Icon name="chevron-right" size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legg til i dette steget */}
              <button
                onClick={() => setCreateStage(stage)}
                className="mt-2.5 w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-400 transition hover:border-slate-400 hover:text-slate-600"
              >
                + Ny avtale
              </button>
            </div>
          );
        })}
      </div>

      {createStage && (
        <CreateDealModal
          stage={createStage}
          customers={customers}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={() => setCreateStage(null)}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}

function CreateDealModal({
  stage,
  customers,
  currentUserId,
  currentUserName,
  onClose,
  onCreated,
}: {
  stage: DealStage;
  customers: Pick<Customer, "id" | "name">[];
  currentUserId: string;
  currentUserName: string;
  onClose: () => void;
  onCreated: (d: DealWithCustomer) => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState({
    customer_id: customers[0]?.id ?? "",
    title: "",
    amount: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form.customer_id) {
      setError("Velg en kunde.");
      return;
    }
    if (!form.title.trim()) {
      setError("Tittel er påkrevd.");
      return;
    }
    setSaving(true);
    setError(null);
    const amount = form.amount ? Number(form.amount.replace(/\s/g, "")) : null;
    const { data, error: err } = await supabase
      .from("deals")
      .insert({
        customer_id: form.customer_id,
        agent_id: currentUserId,
        title: form.title.trim(),
        amount: Number.isFinite(amount) ? amount : null,
        stage,
      })
      .select("*")
      .single();
    setSaving(false);
    if (err || !data) {
      setError(err?.message ?? "Kunne ikke opprette avtalen.");
      return;
    }
    const customerName =
      customers.find((c) => c.id === form.customer_id)?.name ?? "Ukjent kunde";
    onCreated({
      ...(data as DealWithCustomer),
      customer_name: customerName,
      owner_name: currentUserName || null,
    });
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-slate-900">Ny avtale</h2>
        <p className="mb-4 text-sm text-slate-500">
          Steg: {DEAL_STAGE_LABELS[stage]}
        </p>
        <div className="space-y-3">
          <select
            value={form.customer_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, customer_id: e.target.value }))
            }
            className={inputCls}
          >
            {customers.length === 0 && <option value="">Ingen kunder</option>}
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            autoFocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Tittel (f.eks. Årsavtale)"
            className={inputCls}
          />
          <input
            value={form.amount}
            onChange={(e) =>
              setForm((f) => ({ ...f, amount: e.target.value.replace(/[^\d\s]/g, "") }))
            }
            placeholder="Beløp i NOK (valgfritt)"
            inputMode="numeric"
            className={inputCls}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Avbryt
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Lagrer …" : "Opprett avtale"}
          </button>
        </div>
      </div>
    </div>
  );
}
