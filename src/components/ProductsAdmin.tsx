"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BillingType, Product } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import Icon from "./Icon";

const BILLING_LABELS: Record<BillingType, string> = {
  engang: "Faktureres én gang",
  lopende: "Løpende (abonnement)",
};

type FormState = {
  name: string;
  description: string;
  price: string;
  unit_label: string;
  tier: string;
  billing_type: BillingType;
  image_url: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  name: "",
  description: "",
  price: "",
  unit_label: "per stk",
  tier: "Standard",
  billing_type: "engang",
  image_url: "",
  is_active: true,
};

// Produktkatalog-admin: liste + opprett/rediger/slett med bildeopplasting.
export default function ProductsAdmin({
  initialProducts,
}: {
  initialProducts: Product[];
}) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  function upsertLocal(p: Product) {
    setProducts((prev) => {
      const exists = prev.some((x) => x.id === p.id);
      return exists ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p];
    });
  }

  async function remove(id: string) {
    if (!confirm("Slette dette produktet?")) return;
    await supabase.from("products").delete().eq("id", id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Icon name="plus" size={16} />
          Nytt produkt
        </button>
      </div>

      {products.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-400">
          Ingen produkter ennå. Trykk «Nytt produkt» for å legge til det første.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div
              key={p.id}
              className={`card flex flex-col overflow-hidden p-0 ${
                p.is_active ? "" : "opacity-60"
              }`}
            >
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="h-32 w-full object-cover"
                />
              ) : (
                <div className="flex h-32 w-full items-center justify-center bg-slate-100 text-slate-300">
                  <Icon name="box" size={32} />
                </div>
              )}
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{p.name}</h3>
                  <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-2xs font-semibold text-brand-700">
                    {p.tier}
                  </span>
                </div>
                {p.description && (
                  <p className="mt-1 line-clamp-3 text-xs text-slate-500">
                    {p.description}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    {formatCurrency(p.price)}{" "}
                    <span className="text-xs font-normal text-slate-400">
                      {p.unit_label}
                    </span>
                  </span>
                </div>
                <p className="mt-1 text-2xs text-slate-400">
                  {BILLING_LABELS[p.billing_type]}
                  {!p.is_active && " · skjult"}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setEditing(p)}
                    className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Rediger
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Slett
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ProductModal
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            upsertLocal(p);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState<FormState>(
    product
      ? {
          name: product.name,
          description: product.description ?? "",
          price: String(product.price),
          unit_label: product.unit_label,
          tier: product.tier,
          billing_type: product.billing_type,
          image_url: product.image_url ?? "",
          is_active: product.is_active,
        }
      : EMPTY,
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop() ?? "png";
    const path = `produkt-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("products")
      .upload(path, file, { upsert: true });
    if (upErr) {
      setUploading(false);
      setError(
        "Kunne ikke laste opp bilde. Er «products»-bucketen opprettet? (Kjør migrasjon 0021.) Du kan også lime inn en bilde-URL.",
      );
      return;
    }
    const { data } = supabase.storage.from("products").getPublicUrl(path);
    set("image_url", data.publicUrl);
    setUploading(false);
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Navn er påkrevd.");
      return;
    }
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(form.price) || 0,
      unit_label: form.unit_label.trim() || "per stk",
      tier: form.tier.trim() || "Standard",
      billing_type: form.billing_type,
      image_url: form.image_url.trim() || null,
      is_active: form.is_active,
    };

    const query = product
      ? supabase.from("products").update(payload).eq("id", product.id)
      : supabase
          .from("products")
          .insert({ ...payload, created_by: user?.id ?? null });

    const { data, error: err } = await query.select("*").single();
    setSaving(false);
    if (err || !data) {
      setError(err?.message ?? "Kunne ikke lagre produktet.");
      return;
    }
    onSaved(data as Product);
  }

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="animate-panel-in max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl thin-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {product ? "Rediger produkt" : "Nytt produkt"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Lukk"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Navn (f.eks. SoMe – Sosiale Medier Administrasjon)"
            className={inputCls}
          />
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={4}
            placeholder="Beskrivelse (én linje per punkt)"
            className={inputCls}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-500">
              Pris (NOK)
              <input
                type="number"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="1299"
                className={inputCls}
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Enhet
              <input
                value={form.unit_label}
                onChange={(e) => set("unit_label", e.target.value)}
                placeholder="per stk"
                className={inputCls}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-500">
              Merkelapp
              <input
                value={form.tier}
                onChange={(e) => set("tier", e.target.value)}
                placeholder="Standard"
                className={inputCls}
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Fakturering
              <select
                value={form.billing_type}
                onChange={(e) =>
                  set("billing_type", e.target.value as BillingType)
                }
                className={inputCls}
              >
                <option value="engang">Faktureres én gang</option>
                <option value="lopende">Løpende (abonnement)</option>
              </select>
            </label>
          </div>

          {/* Bilde */}
          <div>
            <span className="text-xs font-medium text-slate-500">Bilde</span>
            <div className="mt-1 flex items-center gap-3">
              {form.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.image_url}
                  alt=""
                  className="h-14 w-14 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                  <Icon name="box" size={22} />
                </div>
              )}
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                <Icon name="upload" size={16} />
                {uploading ? "Laster opp …" : "Last opp bilde"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImage}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Synlig i salgsveiviseren
          </label>

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
            {saving ? "Lagrer …" : "Lagre"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
