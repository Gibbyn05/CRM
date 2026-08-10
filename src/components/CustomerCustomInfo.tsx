"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CustomField } from "@/lib/types";
import Icon from "./Icon";

// «Egendefinert info»: fritt definerte felt (label/verdi) på kunden.
// Lagres som JSONB på customers.custom_info.
export default function CustomerCustomInfo({
  customerId,
  initialFields,
}: {
  customerId: string;
  initialFields: CustomField[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [fields, setFields] = useState<CustomField[]>(initialFields);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`customer-custom-info:${customerId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "customers", filter: `id=eq.${customerId}` },
        (payload) => {
          const next = (payload.new as { custom_info?: CustomField[] | null }).custom_info;
          setFields(next ?? []);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [customerId, supabase]);

  function update(i: number, patch: Partial<CustomField>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function addField() {
    setFields((prev) => [...prev, { label: "", value: "" }]);
  }
  function removeField(i: number) {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    const clean = fields
      .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
      .filter((f) => f.label || f.value);
    const { error } = await supabase
      .from("customers")
      .update({ custom_info: clean })
      .eq("id", customerId);
    setSaving(false);
    if (!error) {
      setFields(clean);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Egendefinert info</h2>
        {savedAt && (
          <span className="text-xs font-medium text-emerald-600">Lagret ✓</span>
        )}
      </div>

      {fields.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400">
          Ingen egendefinerte felt ennå. Legg til felt som passer denne kunden
          (f.eks. «Kundenummer», «Kontrakt-ID», «Bransje»).
        </p>
      ) : (
        <div className="mb-4 space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={f.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Felt (f.eks. Kundenummer)"
                className="w-1/3 shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <input
                value={f.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="Verdi"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <button
                onClick={() => removeField(i)}
                aria-label="Fjern felt"
                className="shrink-0 rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={addField}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <Icon name="plus" size={15} />
          Legg til felt
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Lagrer …" : "Lagre"}
        </button>
      </div>
    </div>
  );
}
