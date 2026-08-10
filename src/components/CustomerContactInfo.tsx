"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "@/lib/types";

// Redigerbare kontaktfakta på kundekortet («Om kunden»). Lar deg fylle inn
// e-post, telefon, kontaktperson og adresse manuelt – f.eks. når kunden mangler
// e-post og du skal sende avtale til signering.
type Editable = Pick<
  Customer,
  "contact_name" | "email" | "phone" | "address" | "postal_code" | "city"
>;

export default function CustomerContactInfo({
  customerId,
  initial,
  orgNumberDisplay,
  ownerName,
  createdDisplay,
}: {
  customerId: string;
  initial: Editable;
  orgNumberDisplay: string | null;
  ownerName: string | null;
  createdDisplay: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [values, setValues] = useState<Editable>(initial);
  const [draft, setDraft] = useState<Editable>(initial);

  useEffect(() => {
    const channel = supabase
      .channel(`customer-contact:${customerId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "customers", filter: `id=eq.${customerId}` },
        (payload) => {
          const row = payload.new as Customer;
          const next: Editable = {
            contact_name: row.contact_name,
            email: row.email,
            phone: row.phone,
            address: row.address,
            postal_code: row.postal_code,
            city: row.city,
          };
          setValues(next);
          setDraft((current) => (editing ? current : next));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [customerId, editing, supabase]);

  function set(patch: Partial<Editable>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function startEdit() {
    setDraft(values);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const clean: Editable = {
      contact_name: draft.contact_name?.trim() || null,
      email: draft.email?.trim() || null,
      phone: draft.phone?.trim() || null,
      address: draft.address?.trim() || null,
      postal_code: draft.postal_code?.trim() || null,
      city: draft.city?.trim() || null,
    };
    const { error: err } = await supabase
      .from("customers")
      .update(clean)
      .eq("id", customerId);
    setSaving(false);
    if (err) {
      setError("Kunne ikke lagre. Prøv igjen.");
      return;
    }
    setValues(clean);
    setEditing(false);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
  }

  const fullAddress = [
    values.address,
    [values.postal_code, values.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between border-t border-[#ebe3d7] pt-5">
        <h2 className="label-eyebrow">Kontaktinformasjon</h2>
        {savedAt ? (
          <span className="text-xs font-medium text-emerald-600">Lagret ✓</span>
        ) : !editing ? (
          <button
            onClick={startEdit}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            Rediger
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-3">
          <Field
            label="Kontaktperson"
            value={draft.contact_name ?? ""}
            onChange={(v) => set({ contact_name: v })}
            placeholder="Navn"
          />
          <Field
            label="E-post"
            value={draft.email ?? ""}
            onChange={(v) => set({ email: v })}
            placeholder="kunde@firma.no"
            type="email"
          />
          <Field
            label="Telefon"
            value={draft.phone ?? ""}
            onChange={(v) => set({ phone: v })}
            placeholder="+47 …"
            type="tel"
          />
          <Field
            label="Adresse"
            value={draft.address ?? ""}
            onChange={(v) => set({ address: v })}
            placeholder="Gateadresse"
          />
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Postnr."
              value={draft.postal_code ?? ""}
              onChange={(v) => set({ postal_code: v })}
              placeholder="0000"
            />
            <Field
              label="Poststed"
              value={draft.city ?? ""}
              onChange={(v) => set({ city: v })}
              placeholder="Sted"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Lagrer …" : "Lagre"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Avbryt
            </button>
          </div>
        </div>
      ) : (
        <dl className="space-y-5">
          <Fact label="Kontaktperson" value={values.contact_name} />
          <Fact label="E-post" value={values.email} breakAll />
          <Fact label="Telefon" value={values.phone} />
          <Fact label="Adresse" value={fullAddress || null} />
          <Fact label="Organisasjonsnummer" value={orgNumberDisplay} />
          <Fact label="Tildelt" value={ownerName} />
          <Fact label="Opprettet" value={createdDisplay} />
        </dl>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="label-eyebrow">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

function Fact({
  label,
  value,
  breakAll = false,
}: {
  label: string;
  value: string | null;
  breakAll?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="label-eyebrow">{label}</dt>
      <dd
        className={`mt-0.5 font-medium text-slate-700 ${
          breakAll ? "break-all" : "break-words"
        }`}
      >
        {value ?? <span className="text-slate-300">–</span>}
      </dd>
    </div>
  );
}
