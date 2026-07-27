"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ContractTemplate, TemplateType } from "@/lib/types";
import { TEMPLATE_TYPE_LABELS } from "@/lib/constants";
import { TEMPLATE_PLACEHOLDERS, renderTemplateHtml, renderTemplateText } from "@/lib/templates";
import Icon from "./Icon";

type Draft = { name: string; type: TemplateType; subject: string; body: string };
const EMPTY_DRAFT: Draft = { name: "", type: "contract", subject: "", body: "" };

// Eksempeldata brukt i live-forhåndsvisningen, slik at selgeren/salgssjefen
// ser hvordan malen faktisk vil se ut før den lagres.
const SAMPLE_CONTEXT = {
  customer_name: "Eksempel AS",
  org_number: "923609016",
  company_city: "Oslo",
  advisor_name: "Kari Selger",
  advisor_email: "kari@reachr.no",
  valid_until: new Date(Date.now() + 14 * 86400000).toISOString(),
  items: [
    {
      name: "Grunnpakke",
      description: "Månedlig serviceavtale",
      quantity: 1,
      unit_price: 1990,
      override_price: null,
      billing_interval: "month" as const,
      binding_months: 12,
    },
  ],
};

export default function TemplatesManager({
  initialTemplates,
  isManager,
}: {
  initialTemplates: ContractTemplate[];
  isManager: boolean;
}) {
  const supabase = createClient();
  const [templates, setTemplates] = useState<ContractTemplate[]>(initialTemplates);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (draft.type === "contract") {
      return renderTemplateHtml(draft.body, SAMPLE_CONTEXT);
    }
    return renderTemplateText(draft.body, SAMPLE_CONTEXT).replace(/\n/g, "<br />");
  }, [draft.body, draft.type]);

  function startNew() {
    setDraft(EMPTY_DRAFT);
    setEditingId("new");
    setError(null);
  }

  function startEdit(t: ContractTemplate) {
    setDraft({ name: t.name, type: t.type, subject: t.subject ?? "", body: t.body });
    setEditingId(t.id);
    setError(null);
  }

  async function save() {
    if (!draft.name.trim()) {
      setError("Navn er påkrevd.");
      return;
    }
    if (draft.type === "email" && !draft.subject.trim()) {
      setError("Emnefelt er påkrevd for e-postmaler.");
      return;
    }
    setBusy(true);
    setError(null);
    const patch = {
      name: draft.name.trim(),
      type: draft.type,
      subject: draft.type === "email" ? draft.subject.trim() : null,
      body: draft.body,
    };

    if (editingId === "new") {
      const { data, error: insErr } = await supabase
        .from("contract_templates")
        .insert(patch)
        .select("*")
        .single();
      setBusy(false);
      if (insErr) return setError(insErr.message);
      setTemplates((t) => [...t, data as ContractTemplate].sort((a, b) => a.name.localeCompare(b.name)));
    } else if (editingId) {
      const { data, error: updErr } = await supabase
        .from("contract_templates")
        .update(patch)
        .eq("id", editingId)
        .select("*")
        .single();
      setBusy(false);
      if (updErr) return setError(updErr.message);
      setTemplates((ts) => ts.map((t) => (t.id === editingId ? (data as ContractTemplate) : t)));
    }
    setEditingId(null);
  }

  async function toggleActive(t: ContractTemplate) {
    const { data } = await supabase
      .from("contract_templates")
      .update({ is_active: !t.is_active })
      .eq("id", t.id)
      .select("*")
      .single();
    if (data) setTemplates((ts) => ts.map((x) => (x.id === t.id ? (data as ContractTemplate) : x)));
  }

  async function remove(t: ContractTemplate) {
    if (!confirm(`Slette malen «${t.name}»?`)) return;
    const { error: delErr } = await supabase.from("contract_templates").delete().eq("id", t.id);
    if (delErr) return setError(delErr.message);
    setTemplates((ts) => ts.filter((x) => x.id !== t.id));
  }

  const isEditing = editingId !== null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Maler</h2>
          {isManager && !isEditing && (
            <button
              onClick={startNew}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Icon name="plus" size={15} />
              Ny mal
            </button>
          )}
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {isEditing ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Navn på mal"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <select
                value={draft.type}
                onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as TemplateType }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {(Object.keys(TEMPLATE_TYPE_LABELS) as TemplateType[]).map((k) => (
                  <option key={k} value={k}>
                    {TEMPLATE_TYPE_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            {draft.type === "email" && (
              <input
                value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                placeholder="Emnefelt, f.eks. «Tilbud fra {{advisor_name}}»"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            )}
            <textarea
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              rows={12}
              placeholder="Skriv malteksten – bruk {{plassholdere}} for dynamiske felt."
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
              <p className="mb-1 font-medium text-slate-600">Tilgjengelige plassholdere:</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_PLACEHOLDERS.map((p) => (
                  <code
                    key={p.key}
                    title={p.label}
                    className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200"
                  >
                    {"{{" + p.key + "}}"}
                  </code>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingId(null)}
                className="rounded-lg px-3.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Avbryt
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Lagrer …" : "Lagre mal"}
              </button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${t.is_active ? "text-slate-900" : "text-slate-400 line-through"}`}>
                      {t.name}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      {TEMPLATE_TYPE_LABELS[t.type]}
                    </span>
                  </div>
                  {t.subject && <p className="truncate text-sm text-slate-500">{t.subject}</p>}
                </div>
                {isManager && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => startEdit(t)}
                      title="Rediger"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      onClick={() => toggleActive(t)}
                      title={t.is_active ? "Deaktiver" : "Aktiver"}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Icon name="power" size={15} />
                    </button>
                    <button
                      onClick={() => remove(t)}
                      title="Slett"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                )}
              </li>
            ))}
            {templates.length === 0 && (
              <li className="py-6 text-center text-sm text-slate-400">Ingen maler ennå.</li>
            )}
          </ul>
        )}
      </div>

      {isEditing && (
        <div className="card p-5">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Forhåndsvisning</h2>
          <p className="mb-3 text-xs text-slate-400">
            Vist med eksempeldata («Eksempel AS») – faktisk innhold fylles inn
            fra kunden/tilbudet ved utsendelse, og kan redigeres manuelt før
            sending.
          </p>
          {draft.type === "email" && draft.subject && (
            <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              Emne: {renderTemplateText(draft.subject, SAMPLE_CONTEXT)}
            </p>
          )}
          <div
            className="thin-scroll max-h-[32rem] overflow-y-auto rounded-lg border border-slate-200 p-4 text-sm text-slate-700"
            dangerouslySetInnerHTML={{ __html: preview || "<p style='color:#94a3b8'>(tom mal)</p>" }}
          />
        </div>
      )}
    </div>
  );
}
