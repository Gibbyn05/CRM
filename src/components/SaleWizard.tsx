"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { BillingType, Product } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import Icon from "./Icon";

export interface WizardCustomer {
  id: string;
  name: string;
  org_number: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
}

interface CartItem {
  key: string;
  product_id: string | null;
  name: string;
  description: string | null;
  unit_price: number;
  quantity: number;
  billing_type: BillingType;
  agreement_start: string;
  agreement_end: string;
}

const STEPS = [
  "Produkter og Tjenester",
  "Kundedetaljer",
  "Kontraktsdetaljer",
  "Oversikt",
];

const BILLING_NOTE: Record<BillingType, string> = {
  engang: "Faktureres én gang etter at avtalen er signert.",
  lopende: "Løpende fakturering (abonnement).",
};

export default function SaleWizard({
  products,
  customers,
  currentUserId,
  preselectedCustomerId,
}: {
  products: Product[];
  customers: WizardCustomer[];
  currentUserId: string;
  preselectedCustomerId: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [adding, setAdding] = useState<Product | null>(null);
  const [search, setSearch] = useState("");

  const [customerId, setCustomerId] = useState<string | null>(
    preselectedCustomerId,
  );
  const [customerSearch, setCustomerSearch] = useState("");

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0),
    [cart],
  );
  const customer = customers.find((c) => c.id === customerId) ?? null;

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.org_number ?? "").includes(q),
    );
  }, [customers, customerSearch]);

  function addToCart(item: CartItem) {
    setCart((prev) => [...prev, item]);
    setAdding(null);
    if (!title) setTitle(item.name);
  }

  function removeItem(key: string) {
    setCart((prev) => prev.filter((i) => i.key !== key));
  }

  function updateQty(key: string, qty: number) {
    setCart((prev) =>
      prev.map((i) => (i.key === key ? { ...i, quantity: Math.max(1, qty) } : i)),
    );
  }

  const canNext =
    (step === 1 && cart.length > 0) ||
    (step === 2 && !!customerId) ||
    (step === 3 && title.trim().length > 0) ||
    step === 4;

  async function checkout() {
    if (!customerId) {
      setError("Velg en kunde.");
      setStep(2);
      return;
    }
    setSaving(true);
    setError(null);

    // 1) Opprett tilbudet (deal) – markert som «tilbud sendt».
    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        customer_id: customerId,
        agent_id: currentUserId,
        title: title.trim() || "Tilbud",
        amount: total,
        currency: "NOK",
        stage: "tilbud_sendt",
        offer_sent_at: new Date().toISOString(),
        lost_reason: note.trim() || null,
      })
      .select("id")
      .single();

    if (dealErr || !deal) {
      setSaving(false);
      setError(dealErr?.message ?? "Kunne ikke opprette tilbudet.");
      return;
    }

    // 2) Legg til linjeproduktene.
    const items = cart.map((i) => ({
      deal_id: deal.id,
      product_id: i.product_id,
      name: i.name,
      description: i.description,
      unit_price: i.unit_price,
      quantity: i.quantity,
      billing_type: i.billing_type,
      agreement_start: i.agreement_start || null,
      agreement_end: i.agreement_end || null,
      line_total: i.unit_price * i.quantity,
    }));
    const { error: itemsErr } = await supabase.from("deal_items").insert(items);

    setSaving(false);
    if (itemsErr) {
      setError(
        "Tilbudet ble laget, men produktlinjene feilet: " + itemsErr.message,
      );
      return;
    }

    router.push(`/customers/${customerId}`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Stegindikator */}
      <div className="flex items-center gap-2 overflow-x-auto thin-scroll">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <div key={label} className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => n < step && setStep(n)}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : done
                      ? "text-slate-600 hover:bg-slate-100"
                      : "text-slate-400"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    active
                      ? "bg-brand-600 text-white"
                      : done
                        ? "bg-brand-100 text-brand-700"
                        : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {done ? "✓" : n}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="h-px w-6 bg-slate-200" />
              )}
            </div>
          );
        })}
      </div>

      {/* STEG 1: Produkter + handlekurv */}
      {step === 1 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Icon name="search" size={18} />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Søk etter produkt …"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {filteredProducts.length === 0 ? (
              <div className="card p-8 text-center text-sm text-slate-400">
                Ingen produkter i katalogen ennå. Ledere legger dem til under
                «Produkter».
              </div>
            ) : (
              filteredProducts.map((p) => (
                <div key={p.id} className="card flex gap-4 p-4">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-20 w-20 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                      <Icon name="box" size={26} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{p.name}</h3>
                      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-2xs font-semibold text-brand-700">
                        {p.tier}
                      </span>
                    </div>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-800">
                        {formatCurrency(p.price)}{" "}
                        <span className="text-xs font-normal text-slate-400">
                          {p.unit_label}
                        </span>
                      </span>
                      <button
                        onClick={() => setAdding(p)}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                      >
                        <Icon name="plus" size={15} />
                        Legg til
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Handlekurv */}
          <CartPanel
            cart={cart}
            total={total}
            onRemove={removeItem}
            onQty={updateQty}
          />
        </div>
      )}

      {/* STEG 2: Kundedetaljer */}
      {step === 2 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 card p-5">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Velg kunde</h2>
            <input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Søk etter kunde eller org.nr …"
              className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <div className="max-h-80 space-y-1 overflow-y-auto thin-scroll">
              {filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCustomerId(c.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                    customerId === c.id
                      ? "border-brand-400 bg-brand-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-medium text-slate-800">{c.name}</span>
                  {c.org_number && (
                    <span className="text-xs text-slate-400">
                      {c.org_number}
                    </span>
                  )}
                </button>
              ))}
              {filteredCustomers.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  Ingen kunder funnet.
                </p>
              )}
            </div>
          </div>

          <div className="card h-fit p-5">
            <h3 className="label-eyebrow mb-3">Valgt kunde</h3>
            {customer ? (
              <dl className="space-y-2 text-sm">
                <div className="font-semibold text-slate-900">
                  {customer.name}
                </div>
                <Row label="Kontakt" value={customer.contact_name} />
                <Row label="E-post" value={customer.email} />
                <Row label="Telefon" value={customer.phone} />
                <Row label="Org.nr" value={customer.org_number} />
              </dl>
            ) : (
              <p className="text-sm text-slate-400">Ingen kunde valgt ennå.</p>
            )}
          </div>
        </div>
      )}

      {/* STEG 3: Kontraktsdetaljer */}
      {step === 3 && (
        <div className="card mx-auto max-w-2xl space-y-4 p-6">
          <h2 className="text-lg font-bold text-slate-900">Kontraktsdetaljer</h2>
          <label className="block text-sm font-medium text-slate-600">
            Tilbudstittel
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="F.eks. Tilbud – Sosiale medier"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label className="block text-sm font-medium text-slate-600">
            Notat / avtaledetaljer (valgfritt)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Interne detaljer om avtalen …"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <p className="text-xs text-slate-400">
            Etter «Sjekk ut» kan du sende tilbudet til signering fra kundekortet.
          </p>
        </div>
      )}

      {/* STEG 4: Oversikt */}
      {step === 4 && (
        <div className="card mx-auto max-w-2xl space-y-4 p-6">
          <h2 className="text-lg font-bold text-slate-900">Oversikt</h2>
          <div>
            <h3 className="label-eyebrow mb-1">Kunde</h3>
            <p className="text-sm font-medium text-slate-800">
              {customer?.name ?? "—"}
            </p>
          </div>
          <div>
            <h3 className="label-eyebrow mb-1">Tittel</h3>
            <p className="text-sm text-slate-800">{title || "Tilbud"}</p>
          </div>
          <div>
            <h3 className="label-eyebrow mb-2">Produkter</h3>
            <ul className="divide-y divide-slate-100">
              {cart.map((i) => (
                <li
                  key={i.key}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="text-slate-700">
                    {i.quantity} × {i.name}
                  </span>
                  <span className="font-medium text-slate-800">
                    {formatCurrency(i.unit_price * i.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="font-semibold text-slate-700">Totalt</span>
            <span className="text-xl font-bold text-slate-900">
              {formatCurrency(total)}
            </span>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {/* Navigasjon */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => (step === 1 ? router.push("/salg") : setStep(step - 1))}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          {step === 1 ? "Avbryt" : "Tilbake"}
        </button>

        {step < 4 ? (
          <button
            onClick={() => canNext && setStep(step + 1)}
            disabled={!canNext}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Gå videre
          </button>
        ) : (
          <button
            onClick={checkout}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Lagrer …" : "Sjekk ut"}
          </button>
        )}
      </div>

      {adding && (
        <AddToCartModal
          product={adding}
          onClose={() => setAdding(null)}
          onAdd={addToCart}
        />
      )}
    </div>
  );
}

function CartPanel({
  cart,
  total,
  onRemove,
  onQty,
}: {
  cart: CartItem[];
  total: number;
  onRemove: (key: string) => void;
  onQty: (key: string, qty: number) => void;
}) {
  return (
    <div className="card h-fit p-4 lg:sticky lg:top-4">
      <h3 className="mb-3 font-bold text-slate-900">Handlekurv</h3>
      {cart.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Legg til produkter eller gå videre.
        </p>
      ) : (
        <ul className="space-y-3">
          {cart.map((i) => (
            <li key={i.key} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">
                  {i.name}
                </span>
                <button
                  onClick={() => onRemove(i.key)}
                  aria-label="Fjern"
                  className="text-slate-300 hover:text-red-500"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onQty(i.key, i.quantity - 1)}
                    className="h-6 w-6 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm">{i.quantity}</span>
                  <button
                    onClick={() => onQty(i.key, i.quantity + 1)}
                    className="h-6 w-6 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm font-semibold text-slate-800">
                  {formatCurrency(i.unit_price * i.quantity)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
        <span className="text-sm font-semibold text-slate-600">Totalt</span>
        <span className="text-lg font-bold text-slate-900">
          {formatCurrency(total)}
        </span>
      </div>
      {cart.length > 0 && (
        <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-2xs text-slate-500">
          Du har {cart.length === 1 ? "et produkt" : `${cart.length} produkter`}{" "}
          i kurven. Det vil bli fakturert etter at avtalen er signert.
        </p>
      )}
    </div>
  );
}

function AddToCartModal({
  product,
  onClose,
  onAdd,
}: {
  product: Product;
  onClose: () => void;
  onAdd: (item: CartItem) => void;
}) {
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(String(product.price));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const lineTotal = (Number(price) || 0) * qty;

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="animate-panel-in max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl thin-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900">{product.name}</h2>
          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-2xs font-semibold text-brand-700">
            {product.tier}
          </span>
        </div>
        {product.description && (
          <p className="mb-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {product.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-slate-500">
            Antall
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              className={mInput}
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Pris (per stk)
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={mInput}
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Avtale start
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={mInput}
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Avtale slutt
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={mInput}
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <span className="text-xs text-slate-500">Linjepris</span>
          <span className="text-lg font-bold text-slate-900">
            {formatCurrency(lineTotal)}
          </span>
        </div>
        <p className="mt-2 text-2xs text-slate-400">
          {BILLING_NOTE[product.billing_type]}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Avbryt
          </button>
          <button
            onClick={() =>
              onAdd({
                key: `${product.id}-${Date.now()}`,
                product_id: product.id,
                name: product.name,
                description: product.description,
                unit_price: Number(price) || 0,
                quantity: qty,
                billing_type: product.billing_type,
                agreement_start: start,
                agreement_end: end,
              })
            }
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Icon name="plus" size={15} />
            Legg til
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right text-slate-700">{value || "—"}</dd>
    </div>
  );
}

const mInput =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
