"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { BillingType, ContractTemplate, DealItem, Product } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import Icon from "./Icon";
import ContractDocument from "./ContractDocument";

export interface WizardCustomer {
  id: string;
  name: string;
  org_number: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
}

export interface WizardOrg {
  name: string;
  org_number: string | null;
  address: string;
  logo_url: string | null;
}

export type WizardContractTemplate = Pick<
  ContractTemplate,
  "id" | "name" | "description" | "version"
> & { product_ids: string[] };

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
  sellerName,
  org,
  contractTemplates,
  preselectedCustomerId,
}: {
  products: Product[];
  customers: WizardCustomer[];
  currentUserId: string;
  sellerName: string;
  org: WizardOrg;
  contractTemplates: WizardContractTemplate[];
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
  const [contract, setContract] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [contractDetails, setContractDetails] = useState({
    agreement_period: "",
    start_date: "",
    end_date: "",
    payment_terms: "14 dager fra fakturadato",
    invoice_address: "",
    discount: "",
    one_time_amount: "",
    monthly_amount: "",
  });
  const [missingFields, setMissingFields] = useState<{ key: string; label: string }[]>([]);
  const [generationIssue, setGenerationIssue] = useState("Mangler informasjon");
  const [usedFields, setUsedFields] = useState<{ key: string; label: string; value: unknown }[]>([]);
  const [generationData, setGenerationData] = useState<Record<string, unknown>>({});
  const [generating, setGenerating] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateContract() {
    setGenerating(true);
    setError(null);
    try {
      if (!templateId) throw new Error("Velg en kontraktsmal først.");
      const res = await fetch("/api/contracts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || cart[0]?.name,
          customer_id: customerId,
          template_id: templateId,
          details: contractDetails,
          lines: cart.map((i) => ({
            product_id: i.product_id,
            name: i.name,
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
            billing_type: i.billing_type,
            agreement_start: i.agreement_start,
            agreement_end: i.agreement_end,
          })),
        }),
      });
      const json = await res.json();
      if (res.status === 422) {
        setGenerationIssue(json.error ?? "Mangler informasjon");
        setMissingFields([...(json.missing ?? []), ...(json.unknown ?? [])]);
        throw new Error(json.error ?? "Kontroller kontraktsmalen og manglende opplysninger.");
      }
      if (!res.ok) throw new Error(json.error ?? "Kunne ikke generere kontrakt.");
      if (json.contract) setContract(json.contract);
      setMissingFields([]);
      setUsedFields(json.used_fields ?? []);
      setGenerationData(json.generation_data ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke generere kontrakt.");
    } finally {
      setGenerating(false);
    }
  }

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
    (step === 3 && title.trim().length > 0 && !!templateId && !!contractDetails.end_date && contract.trim().length > 0) ||
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
        contract_text: contract.trim() || null,
        contract_template_id: templateId || null,
        contract_generation_data: generationData,
        agreement_end: contractDetails.end_date,
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
      agreement_end: i.agreement_end || contractDetails.end_date || null,
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

      {/* STEG 3: Kontrakt (AI-forslag) */}
      {step === 3 && (
        <div className="card mx-auto max-w-3xl space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Kontrakt</h2>
              <p className="text-xs text-slate-400">
                Velg organisasjonens mal, kontroller manglende data og generer et redigerbart utkast.
              </p>
            </div>
            <button
              onClick={generateContract}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
            >
              <Icon name="live" size={16} />
              {generating
                ? "Genererer …"
                : contract
                  ? "Generer på nytt"
                  : "Generer kontrakt med AI"}
            </button>
          </div>

          <label className="block text-sm font-medium text-slate-600">
            Kontraktsmal
            <select
              value={templateId}
              onChange={(e) => { setTemplateId(e.target.value); setContract(""); setUsedFields([]); }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Velg kontraktsmal</option>
              {contractTemplates
                .filter((template) => !template.product_ids.length || cart.some((item) => item.product_id && template.product_ids.includes(item.product_id)))
                .map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}
            </select>
            {!contractTemplates.length && <span className="mt-1 block text-xs text-amber-700">Ingen aktive maler. En leder må opprette en under Organisasjon → Kontraktsmaler.</span>}
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-800">Avtaledetaljer</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Avtaleperiode" value={contractDetails.agreement_period} placeholder="F.eks. 12 måneder" onChange={(value) => setContractDetails((d) => ({ ...d, agreement_period: value }))} />
              <DetailField label="Oppstartsdato" value={contractDetails.start_date} type="date" onChange={(value) => setContractDetails((d) => ({ ...d, start_date: value }))} />
              <DetailField label="Avtalens sluttdato" value={contractDetails.end_date} type="date" onChange={(value) => setContractDetails((d) => ({ ...d, end_date: value }))} />
              <DetailField label="Betalingsbetingelser" value={contractDetails.payment_terms} placeholder="14 dager fra fakturadato" onChange={(value) => setContractDetails((d) => ({ ...d, payment_terms: value }))} />
              <DetailField label="Fakturaadresse" value={contractDetails.invoice_address} placeholder="Hentes fra kunden hvis feltet er tomt" onChange={(value) => setContractDetails((d) => ({ ...d, invoice_address: value }))} />
              <DetailField label="Rabatt" value={contractDetails.discount} placeholder="Valgfritt" onChange={(value) => setContractDetails((d) => ({ ...d, discount: value }))} />
              <DetailField label="Månedlig kostnad" value={contractDetails.monthly_amount} placeholder="Beregnes fra løpende produkter" onChange={(value) => setContractDetails((d) => ({ ...d, monthly_amount: value }))} />
            </div>
          </div>

          {missingFields.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <p className="font-bold text-amber-900">{generationIssue}</p>
              <ul className="mt-2 grid list-inside list-disc gap-1 text-sm text-amber-800 sm:grid-cols-2">
                {missingFields.map((field) => <li key={field.key}>{field.label}</li>)}
              </ul>
              <p className="mt-2 text-xs text-amber-700">Reachr genererer ikke kontrakten før feltene er gyldige og nødvendige CRM-data finnes.</p>
            </div>
          )}

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
            Kontraktforslag
            <textarea
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              rows={16}
              placeholder="Trykk «Generer kontrakt med AI», eller skriv kontrakten selv …"
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-mono text-[13px] leading-relaxed focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <p className="text-xs text-slate-400">
            AI-en får ikke lov til å finne på manglende data. Utkastet sendes aldri automatisk.
          </p>

          {usedFields.length > 0 && (
            <details className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <summary className="cursor-pointer text-sm font-bold text-emerald-900">Se {usedFields.length} opplysninger Reachr fylte inn</summary>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                {usedFields.map((field) => <div key={field.key}><dt className="font-semibold text-emerald-800">{field.label}</dt><dd className="truncate text-emerald-950">{String(field.value)}</dd></div>)}
              </dl>
            </details>
          )}
        </div>
      )}

      {/* STEG 4: Oversikt */}
      {step === 4 && (
        <div className="overflow-hidden rounded-xl border border-[#dedede] bg-white shadow-sm">
          <ContractDocument
            contractId="FORHÅNDSVISNING"
            preview
            title={title || "Tilbud"}
            customer={{
              name: customer?.name ?? "Kunde",
              orgNumber: customer?.org_number,
              address: customer?.address,
              postalCode: customer?.postal_code,
              city: customer?.city,
            }}
            organization={{
              name: org.name || "Leverandør",
              orgNumber: org.org_number,
              address: org.address,
              logoUrl: org.logo_url,
            }}
            sellerName={sellerName}
            items={cart.map(
              (item): DealItem => ({
                id: item.key,
                deal_id: "",
                product_id: item.product_id,
                name: item.name,
                description: item.description,
                unit_price: item.unit_price,
                quantity: item.quantity,
                billing_type: item.billing_type,
                agreement_start: item.agreement_start || null,
                agreement_end: item.agreement_end || null,
                line_total: item.unit_price * item.quantity,
                created_at: "",
              }),
            )}
            amount={total}
            currency="NOK"
            contractText={contract}
            signingPanel={
              <div className="flex items-center gap-3 text-sm text-[#777]">
                <span className="h-9 w-9 shrink-0 rounded-full border border-[#e2e2e2]" />
                <span>Venter på signatur</span>
              </div>
            }
          />
          {error && <p className="p-5 text-sm text-red-600">{error}</p>}
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

function DetailField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "date";
}) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

const mInput =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";
