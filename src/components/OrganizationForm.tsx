"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Organization } from "@/lib/types";
import Icon from "./Icon";

// Rediger selskapsinfo/branding (singleton, id = 1). Logo lastes opp til
// Storage-bucketen «branding». Feltene gjenbrukes i kontrakt-/tilbuds-e-post.
export default function OrganizationForm({
  initialOrg,
}: {
  initialOrg: Organization | null;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [form, setForm] = useState({
    name: initialOrg?.name ?? "",
    org_number: initialOrg?.org_number ?? "",
    email: initialOrg?.email ?? "",
    phone: initialOrg?.phone ?? "",
    website: initialOrg?.website ?? "",
    address: initialOrg?.address ?? "",
    postal_code: initialOrg?.postal_code ?? "",
    city: initialOrg?.city ?? "",
    email_signature: initialOrg?.email_signature ?? "",
    contract_footer: initialOrg?.contract_footer ?? "",
  });
  const [logoUrl, setLogoUrl] = useState(initialOrg?.logo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);

    const ext = file.name.split(".").pop() ?? "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("branding")
      .upload(path, file, { upsert: true });

    if (upErr) {
      setUploading(false);
      setMessage({
        type: "err",
        text:
          "Kunne ikke laste opp logo. Er «branding»-bucketen opprettet? (Kjør migrasjon 0010.) Du kan også lime inn en URL under.",
      });
      return;
    }

    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
    setUploading(false);
    setMessage({ type: "ok", text: "Logo lastet opp. Husk å lagre." });
  }

  async function save() {
    // Enkel validering av org.nr (9 siffer eller tomt).
    const org = form.org_number.trim();
    if (org && !/^\d{9}$/.test(org)) {
      setMessage({ type: "err", text: "Organisasjonsnummer må være 9 siffer." });
      return;
    }

    setSaving(true);
    setMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("organization").upsert({
      id: 1,
      name: form.name.trim(),
      org_number: org || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      website: form.website.trim() || null,
      address: form.address.trim() || null,
      postal_code: form.postal_code.trim() || null,
      city: form.city.trim() || null,
      logo_url: logoUrl.trim() || null,
      email_signature: form.email_signature.trim() || null,
      contract_footer: form.contract_footer.trim() || null,
      updated_by: user?.id ?? null,
    });
    setSaving(false);

    if (error) {
      setMessage({ type: "err", text: error.message });
      return;
    }
    setMessage({ type: "ok", text: "Selskapsinfo lagret." });
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Logo + identitet */}
      <div className="card space-y-4 p-6">
        <h2 className="label-eyebrow">Logo</h2>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo"
                className="max-h-24 max-w-[90%] object-contain"
              />
            ) : (
              <span className="flex flex-col items-center gap-1 text-slate-300">
                <Icon name="building" size={32} />
                <span className="text-xs">Ingen logo</span>
              </span>
            )}
          </div>
          <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            <Icon name="upload" size={16} />
            {uploading ? "Laster opp …" : "Last opp logo"}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogo}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <div className="w-full">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              …eller lim inn URL
            </label>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>
      </div>

      {/* Selskapsinfo */}
      <div className="card space-y-4 p-6 lg:col-span-2">
        <h2 className="label-eyebrow">Selskapsinformasjon</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Firmanavn" className="sm:col-span-2">
            <Input value={form.name} onChange={(v) => set("name", v)} placeholder="Firma AS" />
          </Field>
          <Field label="Organisasjonsnummer">
            <Input
              value={form.org_number}
              onChange={(v) => set("org_number", v.replace(/\D/g, "").slice(0, 9))}
              placeholder="9 siffer"
              inputMode="numeric"
            />
          </Field>
          <Field label="Nettside">
            <Input value={form.website} onChange={(v) => set("website", v)} placeholder="https://…" />
          </Field>
          <Field label="E-post">
            <Input value={form.email} onChange={(v) => set("email", v)} placeholder="post@firma.no" type="email" />
          </Field>
          <Field label="Telefon">
            <Input value={form.phone} onChange={(v) => set("phone", v)} placeholder="+47 …" />
          </Field>
          <Field label="Adresse" className="sm:col-span-2">
            <Input value={form.address} onChange={(v) => set("address", v)} placeholder="Gateadresse 1" />
          </Field>
          <Field label="Postnummer">
            <Input
              value={form.postal_code}
              onChange={(v) => set("postal_code", v.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              inputMode="numeric"
            />
          </Field>
          <Field label="Poststed">
            <Input value={form.city} onChange={(v) => set("city", v)} placeholder="Oslo" />
          </Field>
        </div>

        <h2 className="label-eyebrow pt-2">Gjenbruk i maler</h2>
        <Field label="E-postsignatur">
          <textarea
            value={form.email_signature}
            onChange={(e) => set("email_signature", e.target.value)}
            rows={3}
            placeholder="Med vennlig hilsen&#10;Firma AS · post@firma.no · +47 …"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </Field>
        <Field label="Bunntekst i kontrakt-e-post">
          <textarea
            value={form.contract_footer}
            onChange={(e) => set("contract_footer", e.target.value)}
            rows={2}
            placeholder="Firma AS · Org.nr 000 000 000 · Denne e-posten er sendt fra Salgssentral."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </Field>

        {message && (
          <p
            className={`text-sm ${
              message.type === "ok" ? "text-green-600" : "text-red-600"
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Lagrer …" : "Lagre selskapsinfo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-600">
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "numeric" | "text" | "email";
}) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
    />
  );
}
