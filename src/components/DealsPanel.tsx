"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Deal, DealStage, Product } from "@/lib/types";
import { DEAL_STAGES, DEAL_STAGE_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import Icon from "./Icon";

interface CartLine {
  key: string;
  product_id: string | null;
  name: string;
  description: string | null;
  unit_price: number;
  quantity: number;
  billing_type: string;
}

// Salgsstatus per kunde: bygg et tilbud fra produktkatalogen (pris fylles inn
// automatisk), og flytt dealen gjennom pipeline-stegene direkte på kundekortet.
export default function DealsPanel({
  customerId,
  deals,
  setDeals,
  products,
}: {
  customerId: string;
  deals: Deal[];
  setDeals: React.Dispatch<React.SetStateAction<Deal[]>>;
  products: Product[];
}) {
  const supabase = createClient();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);

  function addProduct(productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setCart((prev) => [
      ...prev,
      {
        key: `${p.id}-${Date.now()}`,
        product_id: p.id,
        name: p.name,
        description: p.description,
        unit_price: Number(p.price), // pris fylles inn automatisk
        quantity: 1,
        billing_type: p.billing_type,
      },
    ]);
    if (!title) setTitle(p.name);
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  async function createOffer() {
    if (cart.length === 0) {
      setError("Legg til minst ett produkt.");
      return;
    }
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        customer_id: customerId,
        agent_id: user?.id ?? null,
        title: title.trim() || cart[0].name,
        amount: total,
        currency: "NOK",
        stage: "tilbud_sendt",
        offer_sent_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (dealErr || !deal) {
      setSaving(false);
      setError(dealErr?.message ?? "Kunne ikke opprette tilbudet.");
      return;
    }

    const items = cart.map((l) => ({
      deal_id: (deal as Deal).id,
      product_id: l.product_id,
      name: l.name,
      description: l.description,
      unit_price: l.unit_price,
      quantity: l.quantity,
      billing_type: l.billing_type,
      line_total: l.unit_price * l.quantity,
    }));
    const { error: itemsErr } = await supabase.from("deal_items").insert(items);

    setSaving(false);
    if (itemsErr) {
      setError("Tilbudet ble laget, men produktlinjene feilet: " + itemsErr.message);
      return;
    }

    setDeals((d) => [deal as Deal, ...d]);
    setCart([]);
    setTitle("");
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
    <div className="card p-5">
      <h2 className="mb-3 text-lg font-bold text-slate-900">Salg / tilbud</h2>

      {/* Nytt tilbud fra produktkatalogen */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Legg til produkt
        </label>
        {products.length === 0 ? (
          <p className="text-sm text-slate-400">
            Ingen produkter i katalogen ennå. Ledere legger dem til under
            «Produkter».
          </p>
        ) : (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addProduct(e.target.value);
              e.target.value = "";
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">Velg produkt …</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatCurrency(p.price)} {p.unit_label}
              </option>
            ))}
          </select>
        )}

        {cart.length > 0 && (
          <div className="mt-3 space-y-2">
            {cart.map((l) => (
              <div
                key={l.key}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                  {l.name}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      updateLine(l.key, { quantity: Math.max(1, l.quantity - 1) })
                    }
                    className="h-6 w-6 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm">{l.quantity}</span>
                  <button
                    onClick={() => updateLine(l.key, { quantity: l.quantity + 1 })}
                    className="h-6 w-6 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    +
                  </button>
                </div>
                <input
                  type="number"
                  value={l.unit_price}
                  onChange={(e) =>
                    updateLine(l.key, { unit_price: Number(e.target.value) || 0 })
                  }
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                <button
                  onClick={() => removeLine(l.key)}
                  aria-label="Fjern"
                  className="text-slate-300 hover:text-red-500"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tilbudstittel"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-semibold text-slate-600">
                Totalt: {formatCurrency(total)}
              </span>
              <button
                onClick={createOffer}
                disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "Lagrer …" : "Opprett tilbud"}
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Eksisterende tilbud */}
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
                      ? "bg-brand-600 text-white"
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
