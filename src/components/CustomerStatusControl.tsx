"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CustomerStatus } from "@/lib/types";
import Icon from "./Icon";

// Fargepalett for nye statuser.
const PALETTE = [
  "#22c55e", "#8b5cf6", "#ef4444", "#f59e0b", "#eab308",
  "#14b8a6", "#3b82f6", "#ec4899", "#6366f1", "#64748b",
];

// Kundestatus på kundekortet: velg status (farget), og ledere kan opprette
// nye statuser med navn + farge.
export default function CustomerStatusControl({
  customerId,
  initialStatusId,
  statuses: initialStatuses,
  isManager,
}: {
  customerId: string;
  initialStatusId: string | null;
  statuses: CustomerStatus[];
  isManager: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [statuses, setStatuses] = useState<CustomerStatus[]>(initialStatuses);
  const [statusId, setStatusId] = useState<string | null>(initialStatusId);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const current = statuses.find((s) => s.id === statusId) ?? null;

  useEffect(() => {
    const channel = supabase
      .channel(`customer-status:${customerId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "customers", filter: `id=eq.${customerId}` },
        (payload) => setStatusId((payload.new as { status_id: string | null }).status_id),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [customerId, supabase]);

  // Lukk ved klikk utenfor.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function choose(id: string | null) {
    setStatusId(id);
    setOpen(false);
    await supabase.from("customers").update({ status_id: id }).eq("id", customerId);
  }

  async function createStatus() {
    if (!newName.trim()) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("customer_statuses")
      .insert({
        name: newName.trim(),
        color: newColor,
        created_by: user?.id ?? null,
        sort_order: 100,
      })
      .select("*")
      .single();
    setSaving(false);
    if (error || !data) return;
    const s = data as CustomerStatus;
    setStatuses((prev) => [...prev, s]);
    setNewName("");
    setNewColor(PALETTE[0]);
    setAdding(false);
    await choose(s.id);
  }

  return (
    <div className="relative" ref={boxRef}>
      <p className="label-eyebrow mb-1.5">Status</p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm transition hover:bg-slate-50"
      >
        {current ? (
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: current.color }}
            />
            <span className="font-medium text-slate-700">{current.name}</span>
          </span>
        ) : (
          <span className="text-slate-400">Ingen status</span>
        )}
        <Icon name="chevron-right" size={16} className="rotate-90 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <ul className="max-h-64 overflow-y-auto py-1 thin-scroll">
            <li>
              <button
                onClick={() => choose(null)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
              >
                Ingen status
              </button>
            </li>
            {statuses.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => choose(s.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    s.id === statusId ? "bg-slate-50" : ""
                  }`}
                >
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: `${s.color}22`, color: s.color }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {isManager && (
            <div className="border-t border-slate-100 p-2">
              {!adding ? (
                <button
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  <Icon name="plus" size={15} />
                  Ny status
                </button>
              ) : (
                <div className="space-y-2 p-1">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Navn på status"
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewColor(c)}
                        aria-label={c}
                        className={`h-6 w-6 rounded-full transition ${
                          newColor === c
                            ? "ring-2 ring-slate-900 ring-offset-1"
                            : ""
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setAdding(false)}
                      className="rounded-lg px-2.5 py-1 text-sm text-slate-500 hover:bg-slate-100"
                    >
                      Avbryt
                    </button>
                    <button
                      onClick={createStatus}
                      disabled={saving || !newName.trim()}
                      className="rounded-lg bg-slate-800 px-2.5 py-1 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                    >
                      Lagre
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
