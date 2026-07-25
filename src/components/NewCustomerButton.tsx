"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isValidOrgNumber } from "@/lib/format";
import Icon from "./Icon";
import type { ExtractedFields } from "@/app/api/customers/extract/route";

type FormState = {
  name: string;
  org_number: string;
  contact_name: string;
  email: string;
  phone: string;
  city: string;
};

const EMPTY: FormState = {
  name: "",
  org_number: "",
  contact_name: "",
  email: "",
  phone: "",
  city: "",
};

// Skjema (modal) for å opprette ny kunde. Under feltene ligger en "Fyll inn
// automatisk"-boks der man kan lime inn fritekst eller laste opp/scanne et
// bilde (visittkort, e-postsignatur osv.) som Claude tolker via
// /api/customers/extract og fyller inn feltene fra.
export default function NewCustomerButton() {
  const supabase = createClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  // Automatisk utfylling
  const [smartText, setSmartText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [smartNote, setSmartNote] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  function update(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Slå sammen uttrukne felter inn i skjemaet (behold eksisterende der
  // uttrekket er tomt).
  function applyFields(fields: ExtractedFields) {
    setForm((f) => ({
      name: fields.name || f.name,
      org_number: fields.org_number || f.org_number,
      contact_name: fields.contact_name || f.contact_name,
      email: fields.email || f.email,
      phone: fields.phone || f.phone,
      city: fields.city || f.city,
    }));
    const found = Object.values(fields).filter(Boolean).length;
    setSmartNote(
      found > 0
        ? { ok: true, text: `Fylte inn ${found} felt. Sjekk at alt stemmer.` }
        : { ok: false, text: "Fant ingen opplysninger å fylle inn." },
    );
  }

  async function runExtract(payload: {
    text?: string;
    image?: { media_type: string; data: string };
  }) {
    setExtracting(true);
    setSmartNote(null);
    setError(null);
    try {
      const res = await fetch("/api/customers/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Kunne ikke tolke innholdet.");
      applyFields(json.fields as ExtractedFields);
    } catch (e) {
      setSmartNote({
        ok: false,
        text: e instanceof Error ? e.message : "Ukjent feil.",
      });
    } finally {
      setExtracting(false);
    }
  }

  function fillFromText() {
    if (!smartText.trim()) {
      setSmartNote({ ok: false, text: "Lim inn litt tekst først." });
      return;
    }
    runExtract({ text: smartText });
  }

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // tillat ny opplasting av samme fil
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      setSmartNote({ ok: false, text: "Bildet er for stort (maks 4,5 MB)." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      const data = comma >= 0 ? result.slice(comma + 1) : result;
      runExtract({ image: { media_type: file.type || "image/png", data } });
    };
    reader.readAsDataURL(file);
  }

  function close() {
    setOpen(false);
    setForm(EMPTY);
    setSmartText("");
    setSmartNote(null);
    setError(null);
  }

  async function save() {
    setError(null);
    if (!form.name.trim()) {
      setError("Navn er påkrevd.");
      return;
    }
    if (form.org_number && !isValidOrgNumber(form.org_number)) {
      setError(
        "Ugyldig organisasjonsnummer (må være 9 siffer med gyldig kontrollsiffer).",
      );
      return;
    }

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error: insErr } = await supabase
      .from("customers")
      .insert({
        name: form.name.trim(),
        org_number: form.org_number || null,
        contact_name: form.contact_name || null,
        email: form.email || null,
        phone: form.phone || null,
        city: form.city || null,
        owner_id: user?.id ?? null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    setSaving(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    close();
    router.push(`/customers/${data!.id}`);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        + Ny kunde
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-pop thin-scroll">
            <h2 className="mb-4 text-lg font-bold">Ny kunde</h2>

            {/* Felter */}
            <div className="space-y-3">
              {(
                [
                  ["name", "Navn *"],
                  ["org_number", "Org.nr (9 siffer)"],
                  ["contact_name", "Kontaktperson"],
                  ["email", "E-post"],
                  ["phone", "Telefon"],
                  ["city", "Sted"],
                ] as const
              ).map(([field, label]) => (
                <div key={field}>
                  <label className="mb-1 block text-sm text-slate-600">
                    {label}
                  </label>
                  <input
                    value={form[field]}
                    onChange={(e) => update(field, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              ))}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            {/* Automatisk utfylling (under Sted) */}
            <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                  <Icon name="upload" size={15} />
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-slate-800">
                    Fyll inn automatisk
                  </p>
                  <p className="text-xs text-slate-500">
                    Lim inn tekst eller scan et bilde – så fylles feltene over ut.
                  </p>
                </div>
              </div>

              <textarea
                value={smartText}
                onChange={(e) => setSmartText(e.target.value)}
                rows={4}
                placeholder={
                  "Lim inn f.eks.:\nKontakt: Kjell\nE-post: kjell@oslobil.test\nTelefon: 23232323\nSted: Oslo"
                }
                className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={fillFromText}
                  disabled={extracting}
                  className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {extracting ? "Leser …" : "Fyll inn fra tekst"}
                </button>

                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  <Icon name="upload" size={15} />
                  Scan bilde
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImage}
                    disabled={extracting}
                    className="hidden"
                  />
                </label>
              </div>

              {smartNote && (
                <p
                  className={`mt-2 text-xs ${
                    smartNote.ok ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {smartNote.text}
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={close}
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
      )}
    </>
  );
}
