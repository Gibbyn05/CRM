"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BillingInterval, Product } from "@/lib/types";
import { BILLING_INTERVAL_LABELS, BILLING_INTERVAL_SHORT } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import Icon from "./Icon";

type DraftProduct = {
  name: string;
  description: string;
  price: string;
  billing_interval: BillingInterval;
  binding_months: string;
};

const EMPTY_DRAFT: DraftProduct = {
  name: "",
  description: "",
  price: "",
  billing_interval: "month",
  binding_months: "",
};

// Produkt-/priskatalog. Alle innloggede kan se katalogen (trengs for å bygge
// tilbud på kundekortet); kun salgssjef kan opprette/endre/deaktivere
// produkter (håndhevet både her og i RLS, se migrasjon 0010).
export default function ProductsManager({
  initialProducts,
  isManager,
}: {
  initialProducts: Product[];
  isManager: boolean;
}) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftProduct>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftProduct>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toProductPatch(d: DraftProduct) {
    return {
      name: d.name.trim(),
      description: d.description.trim() || null,
      price: Number(d.price.replace(",", ".")) || 0,
      billing_interval: d.billing_interval,
      binding_months: d.binding_months ? Number(d.binding_months) : null,
    };
  }

  async function createProduct() {
    setError(null);
    if (!draft.name.trim()) {
      setError("Navn er påkrevd.");
      return;
    }
    setBusy(true);
    const { data, error: insErr } = await supabase
      .from("products")
      .insert(toProductPatch(draft))
      .select("*")
      .single();
    setBusy(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setProducts((p) => [...p, data as Product].sort((a, b) => a.name.localeCompare(b.name)));
    setDraft(EMPTY_DRAFT);
    setShowForm(false);
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditDraft({
      name: p.name,
      description: p.description ?? "",
      price: String(p.price),
      billing_interval: p.billing_interval,
      binding_months: p.binding_months != null ? String(p.binding_months) : "",
    });
  }

  async function saveEdit(id: string) {
    setError(null);
    setBusy(true);
    const { data, error: updErr } = await supabase
      .from("products")
      .update(toProductPatch(editDraft))
      .eq("id", id)
      .select("*")
      .single();
    setBusy(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setProducts((ps) => ps.map((p) => (p.id === id ? (data as Product) : p)));
    setEditingId(null);
  }

  async function toggleActive(p: Product) {
    const { data } = await supabase
      .from("products")
      .update({ is_active: !p.is_active })
      .eq("id", p.id)
      .select("*")
      .single();
    if (data) setProducts((ps) => ps.map((x) => (x.id === p.id ? (data as Product) : x)));
  }

  async function remove(p: Product) {
    if (!confirm(`Slette «${p.name}» fra katalogen?`)) return;
    const { error: delErr } = await supabase.from("products").delete().eq("id", p.id);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    setProducts((ps) => ps.filter((x) => x.id !== p.id));
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Produktkatalog</h2>
        {isManager && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Icon name="plus" size={15} />
            Nytt produkt
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {showForm && isManager && (
        <div className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Navn"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <input
              value={draft.price}
              onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
              placeholder="Standardpris (NOK)"
              inputMode="decimal"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <textarea
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Beskrivelse (valgfritt)"
            rows={2}
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={draft.billing_interval}
              onChange={(e) =>
                setDraft((d) => ({ ...d, billing_interval: e.target.value as BillingInterval }))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {(Object.keys(BILLING_INTERVAL_LABELS) as BillingInterval[]).map((k) => (
                <option key={k} value={k}>
                  {BILLING_INTERVAL_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              value={draft.binding_months}
              onChange={(e) => setDraft((d) => ({ ...d, binding_months: e.target.value }))}
              placeholder="Bindingstid (mnd, valgfritt)"
              inputMode="numeric"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Avbryt
            </button>
            <button
              onClick={createProduct}
              disabled={busy}
              className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "Lagrer …" : "Lagre produkt"}
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {products.map((p) => (
          <li key={p.id} className="py-3">
            {editingId === p.id ? (
              <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={editDraft.price}
                    onChange={(e) => setEditDraft((d) => ({ ...d, price: e.target.value }))}
                    inputMode="decimal"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <textarea
                  value={editDraft.description}
                  onChange={(e) =>
                    setEditDraft((d) => ({ ...d, description: e.target.value }))
                  }
                  rows={2}
                  className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={editDraft.billing_interval}
                    onChange={(e) =>
                      setEditDraft((d) => ({
                        ...d,
                        billing_interval: e.target.value as BillingInterval,
                      }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {(Object.keys(BILLING_INTERVAL_LABELS) as BillingInterval[]).map((k) => (
                      <option key={k} value={k}>
                        {BILLING_INTERVAL_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={editDraft.binding_months}
                    onChange={(e) =>
                      setEditDraft((d) => ({ ...d, binding_months: e.target.value }))
                    }
                    placeholder="Bindingstid (mnd)"
                    inputMode="numeric"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={() => saveEdit(p.id)}
                    disabled={busy}
                    className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {busy ? "Lagrer …" : "Lagre"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${p.is_active ? "text-slate-900" : "text-slate-400 line-through"}`}>
                      {p.name}
                    </span>
                    {!p.is_active && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        Inaktiv
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-0.5 truncate text-sm text-slate-500">{p.description}</p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {p.binding_months ? `${p.binding_months} mnd binding` : "Ingen binding"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="whitespace-nowrap text-sm font-semibold text-slate-700">
                    {formatCurrency(p.price)}
                    <span className="text-xs font-normal text-slate-400">
                      {BILLING_INTERVAL_SHORT[p.billing_interval]}
                    </span>
                  </span>
                  {isManager && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(p)}
                        title="Rediger"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        onClick={() => toggleActive(p)}
                        title={p.is_active ? "Deaktiver" : "Aktiver"}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Icon name="power" size={15} />
                      </button>
                      <button
                        onClick={() => remove(p)}
                        title="Slett"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
        {products.length === 0 && (
          <li className="py-6 text-center text-sm text-slate-400">
            Ingen produkter i katalogen ennå.
          </li>
        )}
      </ul>
    </div>
  );
}
