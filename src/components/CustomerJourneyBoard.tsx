"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Icon from "./Icon";

export interface JourneyStage {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface JourneyCustomer {
  id: string;
  name: string;
  org_number: string | null;
  journey_stage_id: string | null;
  owner_name: string | null;
}

const PALETTE = [
  "#22c55e", "#8b5cf6", "#ef4444", "#f59e0b", "#eab308",
  "#14b8a6", "#3b82f6", "#ec4899", "#6366f1", "#64748b",
];
const NONE_COLOR = "#94a3b8";

type Column = {
  id: string | null;
  name: string;
  color: string;
  fixed: boolean;
};

// Personlig kundereise. Hver bruker har egne steg og egne kundeplasseringer.
export default function CustomerJourneyBoard({
  initialCustomers,
  initialStatuses,
  userId,
}: {
  initialCustomers: JourneyCustomer[];
  initialStatuses: JourneyStage[];
  userId: string;
}) {
  const supabase = createClient();
  const [customers, setCustomers] = useState(initialCustomers);
  const [statuses, setStatuses] = useState(
    [...initialStatuses].sort((a, b) => a.sort_order - b.sort_order),
  );

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | "none" | null>(null);
  const draggedRef = useRef(false);

  const [addingCol, setAddingCol] = useState(false);
  const [editingCol, setEditingCol] = useState<string | null>(null);

  const columns: Column[] = useMemo(
    () => [
      { id: null, name: "Ikke plassert", color: NONE_COLOR, fixed: true },
      ...statuses.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        fixed: false,
      })),
    ],
    [statuses],
  );

  function customersIn(colId: string | null) {
    return customers.filter((c) => c.journey_stage_id === colId);
  }

  async function moveCustomer(customerId: string, statusId: string | null) {
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, journey_stage_id: statusId } : c)),
    );
    await supabase.from("customer_journey_positions").upsert({
      user_id: userId,
      customer_id: customerId,
      stage_id: statusId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,customer_id" });
  }

  function onDrop(colId: string | null) {
    setOverCol(null);
    const id = draggingId;
    setDraggingId(null);
    if (id) moveCustomer(id, colId);
  }

  // ── Kolonne-administrasjon ──
  async function addStatus(name: string, color: string) {
    const maxOrder = statuses.reduce((m, s) => Math.max(m, s.sort_order), 0);
    const { data } = await supabase
      .from("customer_journey_stages")
      .insert({
        user_id: userId,
        name: name.trim(),
        color,
        sort_order: maxOrder + 10,
      })
      .select("*")
      .single();
    if (data) setStatuses((prev) => [...prev, data as JourneyStage]);
    setAddingCol(false);
  }

  async function renameStatus(id: string, name: string, color: string) {
    setStatuses((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name, color } : s)),
    );
    setEditingCol(null);
    await supabase
      .from("customer_journey_stages")
      .update({ name: name.trim(), color, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  async function deleteStatus(id: string) {
    if (!confirm("Slette dette steget? Kundene flyttes til Ikke plassert.")) return;
    setStatuses((prev) => prev.filter((s) => s.id !== id));
    setCustomers((prev) =>
      prev.map((c) => (c.journey_stage_id === id ? { ...c, journey_stage_id: null } : c)),
    );
    await supabase.from("customer_journey_stages").delete().eq("id", id);
  }

  async function reorderStatus(id: string, dir: -1 | 1) {
    const idx = statuses.findIndex((s) => s.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= statuses.length) return;
    const a = statuses[idx];
    const b = statuses[swapIdx];
    const next = [...statuses];
    next[idx] = { ...b, sort_order: a.sort_order };
    next[swapIdx] = { ...a, sort_order: b.sort_order };
    next.sort((x, y) => x.sort_order - y.sort_order);
    setStatuses(next);
    await Promise.all([
      supabase
        .from("customer_journey_stages")
        .update({ sort_order: b.sort_order, updated_at: new Date().toISOString() })
        .eq("id", a.id),
      supabase
        .from("customer_journey_stages")
        .update({ sort_order: a.sort_order, updated_at: new Date().toISOString() })
        .eq("id", b.id),
    ]);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 thin-scroll">
      {columns.map((col, colIndex) => {
        const key = col.id ?? "none";
        const list = customersIn(col.id);
        const isOver = overCol === key;
        return (
          <div
            key={key}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(key);
            }}
            onDragLeave={() => setOverCol((s) => (s === key ? null : s))}
            onDrop={() => onDrop(col.id)}
            className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-slate-50/60 transition ${
              isOver ? "border-brand-400 bg-brand-50/50" : "border-slate-200"
            }`}
          >
            {/* Kolonneheader */}
            {editingCol === col.id && col.id ? (
              <ColumnEditor
                initial={{ name: col.name, color: col.color }}
                onCancel={() => setEditingCol(null)}
                onSave={(name, color) => renameStatus(col.id!, name, color)}
              />
            ) : (
              <div className="flex items-center gap-1.5 border-b border-slate-200 px-3 py-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: col.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
                  {col.name}
                </span>
                <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-2xs font-semibold text-slate-500 ring-1 ring-slate-200">
                  {list.length}
                </span>
                {!col.fixed && (
                  <div className="flex items-center">
                    <button
                      onClick={() => reorderStatus(col.id!, -1)}
                      aria-label="Flytt venstre"
                      className="rounded p-0.5 text-slate-300 hover:text-slate-600"
                    >
                      <Icon name="chevron-left" size={14} />
                    </button>
                    <button
                      onClick={() => reorderStatus(col.id!, 1)}
                      aria-label="Flytt høyre"
                      className="rounded p-0.5 text-slate-300 hover:text-slate-600"
                    >
                      <Icon name="chevron-right" size={14} />
                    </button>
                    <button
                      onClick={() => setEditingCol(col.id)}
                      aria-label="Rediger"
                      className="rounded p-0.5 text-slate-300 hover:text-brand-600"
                    >
                      <Icon name="upload" size={13} className="rotate-90" />
                    </button>
                    <button
                      onClick={() => deleteStatus(col.id!)}
                      aria-label="Slett"
                      className="rounded p-0.5 text-slate-300 hover:text-red-500"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Kort */}
            <div className="flex flex-1 flex-col gap-2 p-2">
              {list.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => {
                    draggedRef.current = true;
                    setDraggingId(c.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverCol(null);
                    setTimeout(() => (draggedRef.current = false), 50);
                  }}
                  className={`group rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition ${
                    draggingId === c.id ? "opacity-40" : "hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <Link
                      href={`/customers/${c.id}`}
                      onClick={(e) => {
                        if (draggedRef.current) e.preventDefault();
                      }}
                      className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 hover:underline"
                    >
                      {c.name}
                    </Link>
                    <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
                      {colIndex > 0 && (
                        <button
                          onClick={() =>
                            moveCustomer(c.id, columns[colIndex - 1].id)
                          }
                          aria-label="Forrige steg"
                          className="rounded p-0.5 text-slate-300 hover:text-slate-600"
                        >
                          <Icon name="chevron-left" size={15} />
                        </button>
                      )}
                      {colIndex < columns.length - 1 && (
                        <button
                          onClick={() =>
                            moveCustomer(c.id, columns[colIndex + 1].id)
                          }
                          aria-label="Neste steg"
                          className="rounded p-0.5 text-slate-300 hover:text-slate-600"
                        >
                          <Icon name="chevron-right" size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  {c.org_number && (
                    <p className="mt-0.5 text-2xs text-slate-400">
                      Org.nr {c.org_number}
                    </p>
                  )}
                  {c.owner_name && (
                    <p className="mt-1 text-xs text-slate-500">{c.owner_name}</p>
                  )}
                </div>
              ))}
              {list.length === 0 && (
                <p className="px-1 py-6 text-center text-xs text-slate-300">
                  Dra kunder hit
                </p>
              )}
            </div>
          </div>
        );
      })}

      {/* Ny kolonne */}
      <div className="w-72 shrink-0">
        {addingCol ? (
          <ColumnEditor
            initial={{ name: "", color: PALETTE[0] }}
            onCancel={() => setAddingCol(false)}
            onSave={(name, color) => addStatus(name, color)}
          />
        ) : (
          <button
            onClick={() => setAddingCol(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600"
          >
            <Icon name="plus" size={16} />
            Nytt steg
          </button>
        )}
      </div>
    </div>
  );
}

function ColumnEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: { name: string; color: string };
  onCancel: () => void;
  onSave: (name: string, color: string) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Navn på steg"
        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={c}
            className={`h-6 w-6 rounded-full transition ${
              color === c ? "ring-2 ring-slate-900 ring-offset-1" : ""
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-2.5 py-1 text-sm text-slate-500 hover:bg-slate-100"
        >
          Avbryt
        </button>
        <button
          onClick={() => name.trim() && onSave(name.trim(), color)}
          disabled={!name.trim()}
          className="rounded-lg bg-brand-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}
