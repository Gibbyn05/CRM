"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Deal, DealItem, DealStage, Product } from "@/lib/types";
import { DEAL_STAGES, DEAL_STAGE_LABELS, BILLING_INTERVAL_SHORT } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { calculateTotal, lineEffectivePrice } from "@/lib/templates";
import Icon from "./Icon";

// Salgsstatus per kunde: viser tilbud sendt / akseptert, lar selger flytte
// dealen gjennom pipeline-stegene, og legge produkter fra katalogen inn på
// tilbudet med kontrollert prisoverstyring (>30% avvik krever salgssjef,
// håndhevet i databasen – se migrasjon 0010).
export default function DealsPanel({
  customerId,
  initialDeals,
  initialItemsByDeal,
  products,
}: {
  customerId: string;
  initialDeals: Deal[];
  initialItemsByDeal: Record<string, DealItem[]>;
  products: Product[];
}) {
  const supabase = createClient();
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [itemsByDeal, setItemsByDeal] = useState<Record<string, DealItem[]>>(
    initialItemsByDeal,
  );
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [overridePrice, setOverridePrice] = useState("");
  const [itemError, setItemError] = useState<string | null>(null);

  async function addDeal() {
    if (!title.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("deals")
      .insert({
        customer_id: customerId,
        agent_id: user?.id ?? null,
        title: title.trim(),
        amount: amount ? Number(amount) : null,
        stage: "ringt",
      })
      .select("*")
      .single();
    if (data) setDeals((d) => [data as Deal, ...d]);
    setTitle("");
    setAmount("");
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

  function openAddItem(dealId: string) {
    setAddingTo(dealId);
    setItemError(null);
    setProductId(products[0]?.id ?? "");
    setQuantity("1");
    setOverridePrice("");
  }

  async function addItem(dealId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      setItemError("Velg et produkt.");
      return;
    }
    const qty = Number(quantity) || 1;
    const override = overridePrice.trim() ? Number(overridePrice.replace(",", ".")) : null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("deal_items")
      .insert({
        deal_id: dealId,
        product_id: product.id,
        name: product.name,
        description: product.description,
        quantity: qty,
        unit_price: product.price,
        override_price: override,
        billing_interval: product.billing_interval,
        binding_months: product.binding_months,
        created_by: user?.id ?? null,
      })
      .select("*")
      .single();

    if (error) {
      // Databasen avviser selv >30% prisavvik uten salgssjef-rolle – vis
      // feilmeldingen fra RAISE EXCEPTION i enforce_deal_item_price().
      setItemError(error.message);
      return;
    }
    setItemsByDeal((m) => ({
      ...m,
      [dealId]: [...(m[dealId] ?? []), data as DealItem],
    }));
    setAddingTo(null);
  }

  async function removeItem(dealId: string, itemId: string) {
    await supabase.from("deal_items").delete().eq("id", itemId);
    setItemsByDeal((m) => ({
      ...m,
      [dealId]: (m[dealId] ?? []).filter((i) => i.id !== itemId),
    }));
  }

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-lg font-bold text-slate-900">Salg / tilbud</h2>

      <div className="mb-4 space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tittel (f.eks. Årsavtale)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Beløp (NOK, valgfritt hvis produkter legges til)"
            type="number"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            onClick={addDeal}
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Legg til
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {deals.map((d) => {
          const items = itemsByDeal[d.id] ?? [];
          const itemsTotal = items.length ? calculateTotal(items) : null;
          const isOpen = expanded[d.id] ?? false;
          return (
            <li key={d.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{d.title}</span>
                <span className="text-sm text-slate-600">
                  {formatCurrency(itemsTotal ?? d.amount, d.currency)}
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
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex gap-3">
                  <span>{d.offer_sent_at ? "✓ Tilbud sendt" : "Tilbud ikke sendt"}</span>
                  <span>{d.offer_accepted_at ? "✓ Akseptert" : ""}</span>
                </div>
                <button
                  onClick={() => setExpanded((m) => ({ ...m, [d.id]: !isOpen }))}
                  className="font-medium text-brand-600 hover:underline"
                >
                  {isOpen ? "Skjul produkter" : `Produkter (${items.length})`}
                </button>
              </div>

              {isOpen && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {items.length > 0 && (
                    <ul className="mb-2 space-y-1.5">
                      {items.map((item) => {
                        const price = lineEffectivePrice(item);
                        const discounted = item.override_price != null;
                        return (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm"
                          >
                            <div className="min-w-0">
                              <span className="font-medium text-slate-700">
                                {item.quantity}× {item.name}
                              </span>
                              <span className="ml-1.5 text-xs text-slate-400">
                                {formatCurrency(price)}
                                {BILLING_INTERVAL_SHORT[item.billing_interval]}
                                {discounted && (
                                  <span className="ml-1 line-through">
                                    {formatCurrency(item.unit_price)}
                                  </span>
                                )}
                              </span>
                            </div>
                            <button
                              onClick={() => removeItem(d.id, item.id)}
                              className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Fjern"
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {addingTo === d.id ? (
                    <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-2.5">
                      <select
                        value={productId}
                        onChange={(e) => setProductId(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      >
                        {products.length === 0 && <option value="">Ingen produkter i katalogen</option>}
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} – {formatCurrency(p.price)}
                            {BILLING_INTERVAL_SHORT[p.billing_interval]}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <input
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          type="number"
                          min={1}
                          placeholder="Antall"
                          className="w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        />
                        <input
                          value={overridePrice}
                          onChange={(e) => setOverridePrice(e.target.value)}
                          placeholder="Overstyrt pris (valgfritt)"
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        />
                      </div>
                      {itemError && <p className="text-xs text-red-600">{itemError}</p>}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setAddingTo(null)}
                          className="rounded-lg px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
                        >
                          Avbryt
                        </button>
                        <button
                          onClick={() => addItem(d.id)}
                          disabled={!products.length}
                          className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          Legg til
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => openAddItem(d.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      <Icon name="plus" size={12} />
                      Legg til produkt
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {deals.length === 0 && (
          <li className="text-sm text-slate-400">Ingen tilbud registrert.</li>
        )}
      </ul>
    </div>
  );
}
