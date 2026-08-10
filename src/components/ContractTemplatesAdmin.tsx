"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ContractTemplate, Product } from "@/lib/types";
import Icon from "./Icon";

type TemplateRow = ContractTemplate & { product_ids: string[] };

const EMPTY = {
  id: "",
  name: "",
  description: "",
  template_text: "",
  source_file_name: "",
  source_file_path: "",
  source_mime_type: "",
  is_active: true,
  product_ids: [] as string[],
};

export default function ContractTemplatesAdmin({
  initialTemplates,
  products,
}: {
  initialTemplates: TemplateRow[];
  products: Product[];
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState(initialTemplates);
  const [draft, setDraft] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const activeCount = useMemo(
    () => templates.filter((template) => template.is_active).length,
    [templates],
  );

  function edit(template: TemplateRow) {
    setDraft({
      id: template.id,
      name: template.name,
      description: template.description ?? "",
      template_text: template.template_text,
      source_file_name: template.source_file_name ?? "",
      source_file_path: template.source_file_path ?? "",
      source_mime_type: template.source_mime_type ?? "",
      is_active: template.is_active,
      product_ids: template.product_ids ?? [],
    });
    setFile(null);
    setMessage(null);
  }

  function reset() {
    setDraft(EMPTY);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function chooseFile(next: File | null) {
    setFile(next);
    if (!next) return;
    setDraft((current) => ({
      ...current,
      name: current.name || next.name.replace(/\.[^.]+$/, ""),
      source_file_name: next.name,
      source_mime_type: next.type || "application/octet-stream",
    }));
    if (/^(text\/|application\/(json|rtf))/.test(next.type) || /\.(txt|md|rtf)$/i.test(next.name)) {
      const text = await next.text();
      setDraft((current) => ({ ...current, template_text: text }));
    } else if (next.type === "application/pdf" || /\.pdf$/i.test(next.name)) {
      setExtracting(true);
      setMessage(null);
      const form = new FormData();
      form.append("file", next);
      const response = await fetch("/api/contract-templates/extract", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      setExtracting(false);
      if (!response.ok) return setMessage(payload.error ?? "Kunne ikke lese PDF-filen.");
      setDraft((current) => ({ ...current, template_text: payload.text ?? "" }));
      setMessage("Kontraktsteksten er hentet fra PDF-en. Kontroller teksten før lagring.");
    }
  }

  async function save() {
    if (!draft.name.trim()) return setMessage("Gi kontraktsmalen et navn.");
    if (!draft.template_text.trim()) {
      return setMessage("Lim inn kontraktsteksten som AI-en skal bevare og fylle ut.");
    }
    setSaving(true);
    setMessage(null);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? null;
    let filePath = draft.source_file_path || null;

    if (file) {
      filePath = `organization-1/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const { error } = await supabase.storage
        .from("contract-templates")
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (error) {
        setSaving(false);
        return setMessage("Kunne ikke laste opp originalfilen: " + error.message);
      }
    }

    const payload = {
      organization_id: 1,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      template_text: draft.template_text.trim(),
      source_file_name: file?.name || draft.source_file_name || null,
      source_file_path: filePath,
      source_mime_type: file?.type || draft.source_mime_type || null,
      is_active: draft.is_active,
      updated_by: userId,
      ...(draft.id ? { version: (templates.find((t) => t.id === draft.id)?.version ?? 0) + 1 } : { created_by: userId }),
    };

    const result = draft.id
      ? await supabase.from("contract_templates").update(payload).eq("id", draft.id).select("*").single<ContractTemplate>()
      : await supabase.from("contract_templates").insert({ ...payload, version: 1 }).select("*").single<ContractTemplate>();
    const { data, error } = result;
    if (error || !data) {
      setSaving(false);
      return setMessage(error?.message ?? "Kunne ikke lagre kontraktsmalen.");
    }

    await supabase.from("contract_template_products").delete().eq("template_id", data.id);
    if (draft.product_ids.length) {
      const { error: relationError } = await supabase
        .from("contract_template_products")
        .insert(draft.product_ids.map((product_id) => ({ template_id: data.id, product_id })));
      if (relationError) {
        setSaving(false);
        return setMessage("Malen ble lagret, men produktkoblingen feilet: " + relationError.message);
      }
    }

    const row: TemplateRow = { ...data, product_ids: draft.product_ids };
    setTemplates((current) =>
      draft.id ? current.map((item) => (item.id === data.id ? row : item)) : [row, ...current],
    );
    reset();
    setSaving(false);
    setMessage("Kontraktsmalen er lagret og klar for salgsveiviseren.");
  }

  async function toggle(template: TemplateRow) {
    const { error } = await supabase
      .from("contract_templates")
      .update({ is_active: !template.is_active })
      .eq("id", template.id);
    if (error) return setMessage(error.message);
    setTemplates((current) =>
      current.map((item) => item.id === template.id ? { ...item, is_active: !item.is_active } : item),
    );
  }

  async function download(template: TemplateRow) {
    if (!template.source_file_path) return;
    const { data, error } = await supabase.storage
      .from("contract-templates")
      .createSignedUrl(template.source_file_path, 60);
    if (error) return setMessage(error.message);
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#ded2bf] bg-[#fbf7ef] shadow-[0_20px_60px_rgba(62,45,22,0.08)]">
      <div className="grid border-b border-[#ded2bf] lg:grid-cols-[1fr_auto]">
        <div className="p-7 lg:p-9">
          <p className="label-eyebrow text-[#8c785b]">Organisasjonens dokumentmotor</p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-[#251e16]">Kontraktsmaler</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#776b5c]">
            Originalen lagres privat. Reachr bruker malteksten som juridisk ramme og fyller bare inn dokumenterte CRM-opplysninger.
          </p>
        </div>
        <div className="flex items-center gap-8 border-t border-[#ded2bf] px-8 py-6 lg:border-l lg:border-t-0">
          <Stat value={templates.length} label="maler" />
          <Stat value={activeCount} label="aktive" accent />
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <div className="border-b border-[#ded2bf] p-6 lg:border-b-0 lg:border-r lg:p-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-[#30271d]">Tilgjengelige maler</h3>
            <button onClick={reset} className="text-sm font-semibold text-emerald-700 hover:underline">+ Ny mal</button>
          </div>
          <div className="space-y-3">
            {templates.map((template) => (
              <article key={template.id} className={`rounded-2xl border p-4 transition ${draft.id === template.id ? "border-emerald-500 bg-emerald-50/60" : "border-[#e3d8c7] bg-white/70 hover:border-[#b9a98e]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <button className="min-w-0 text-left" onClick={() => edit(template)}>
                    <span className="block truncate font-semibold text-[#2c241b]">{template.name}</span>
                    <span className="mt-1 block text-xs text-[#8a7e6e]">Versjon {template.version} · {template.product_ids.length ? `${template.product_ids.length} produktkoblinger` : "Alle produkter"}</span>
                  </button>
                  <button onClick={() => toggle(template)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${template.is_active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>
                    {template.is_active ? "Aktiv" : "Av"}
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-[#7c6c57]">
                  <button onClick={() => edit(template)} className="hover:text-emerald-700">Rediger</button>
                  {template.source_file_path && <button onClick={() => download(template)} className="hover:text-emerald-700">Åpne original</button>}
                </div>
              </article>
            ))}
            {!templates.length && <div className="rounded-2xl border border-dashed border-[#cdbfa9] p-8 text-center text-sm text-[#8a7e6e]">Ingen kontraktsmaler er opprettet ennå.</div>}
          </div>
        </div>

        <div className="space-y-5 p-6 lg:p-8">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[#30271d]">{draft.id ? "Rediger mal" : "Opprett mal"}</h3>
            {draft.id && <span className="rounded-full bg-[#eee5d7] px-3 py-1 text-xs font-semibold text-[#796951]">Ny versjon ved lagring</span>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Malnavn"><Input value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} placeholder="F.eks. SEO-avtale" /></Field>
            <Field label="Status">
              <select value={String(draft.is_active)} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.value === "true" }))} className="template-input">
                <option value="true">Aktiv</option><option value="false">Deaktivert</option>
              </select>
            </Field>
          </div>
          <Field label="Beskrivelse"><Input value={draft.description} onChange={(description) => setDraft((d) => ({ ...d, description }))} placeholder="Når skal selgerne bruke denne malen?" /></Field>
          <Field label="Original kontraktsfil">
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-[#bfae92] bg-white/60 px-4 py-3 text-sm text-[#6f624f] hover:border-emerald-600">
              <span className="flex items-center gap-2"><Icon name="upload" size={17} />{extracting ? "Leser kontrakten med AI …" : file?.name || draft.source_file_name || "Velg PDF, Word eller tekstfil"}</span>
              <span className="text-xs font-bold uppercase tracking-wide text-emerald-700">Velg fil</span>
              <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.rtf" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
          <Field label="Brukes for produkter">
            <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-xl border border-[#d8ccb9] bg-white/60 p-3">
              {products.map((product) => {
                const selected = draft.product_ids.includes(product.id);
                return <button type="button" key={product.id} onClick={() => setDraft((d) => ({ ...d, product_ids: selected ? d.product_ids.filter((id) => id !== product.id) : [...d.product_ids, product.id] }))} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-[#d8ccb9] bg-white text-[#6f624f]"}`}>{product.name}</button>;
              })}
              {!products.length && <span className="text-xs text-[#8a7e6e]">Ingen produkter er opprettet.</span>}
            </div>
            <p className="mt-1 text-xs text-[#938673]">Ingen valg betyr at malen kan brukes for alle produkter.</p>
          </Field>
          <Field label="Kontraktstekst som AI skal fylle ut">
            <textarea value={draft.template_text} onChange={(e) => setDraft((d) => ({ ...d, template_text: e.target.value }))} rows={14} placeholder="Lim inn den juridiske originalteksten her. Tekstfiler leses automatisk ved opplasting." className="template-input resize-y font-mono text-[12px] leading-5" />
          </Field>
          {message && <p className={`text-sm ${/(lagret|hentet)/i.test(message) ? "text-emerald-700" : "text-red-600"}`}>{message}</p>}
          <div className="flex justify-end gap-3">
            {draft.id && <button onClick={reset} className="rounded-xl border border-[#cfc1aa] px-4 py-2.5 text-sm font-semibold text-[#6f624f]">Avbryt</button>}
            <button onClick={save} disabled={saving || extracting} className="rounded-xl bg-[#1b5f44] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#134b35] disabled:opacity-50">{saving ? "Lagrer …" : "Lagre kontraktsmal"}</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label, accent = false }: { value: number; label: string; accent?: boolean }) {
  return <div><strong className={`block font-serif text-3xl ${accent ? "text-emerald-700" : "text-[#2c241b]"}`}>{value}</strong><span className="text-xs uppercase tracking-[0.16em] text-[#8a7e6e]">{label}</span></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold text-[#665946]"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Input({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="template-input" />; }
