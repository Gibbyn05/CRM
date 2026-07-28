"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isValidOrgNumber, formatOrgNumber } from "@/lib/format";
import Icon from "./Icon";
import type { ExtractedFields } from "@/app/api/customers/extract/route";

type FormState = {
  name: string;
  org_number: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  postal_code: string;
  city: string;
};

const EMPTY: FormState = {
  name: "",
  org_number: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  postal_code: "",
  city: "",
};

interface ExistingCustomerHit {
  id: string;
  name: string;
  city: string | null;
  owner_name: string | null;
  created_at: string;
}

interface CompanyLookupState {
  orgnr: string;
  fields: {
    name: string;
    org_form: string;
    ceo_name: string;
    phone: string;
    city: string;
    address: string;
    postal_code: string;
    industry: string;
  };
  flags: { konkurs: boolean; underAvvikling: boolean };
  notes: string[];
  existingCustomer: ExistingCustomerHit | null;
}

// Skjema (modal) for å opprette ny kunde.
//
// Org.nr-feltet har et eget "Slå opp"-steg mot Brønnøysundregistrene: treffet
// vises i en forhåndsvisning (navn, adresse, bransje, daglig leder og
// telefon der det finnes) FØR skjemaet fylles ut og kunden lagres. Finnes
// org.nr allerede som kunde, vises det tydelig i stedet og lagring
// blokkeres for å unngå utilsiktede duplikater.
//
// Under feltene ligger i tillegg en "Fyll inn automatisk"-boks der man kan
// lime inn fritekst eller laste opp/scanne et bilde (visittkort,
// e-postsignatur osv.) som Claude tolker via /api/customers/extract.
export default function NewCustomerButton() {
  const supabase = createClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  // Automatisk utfylling (fritekst/bilde)
  const [smartText, setSmartText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [smartNote, setSmartNote] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // Registeroppslag (Brønnøysund)
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<CompanyLookupState | null>(null);

  const isDuplicate = Boolean(
    lookup?.existingCustomer && lookup.orgnr === form.org_number.replace(/\s/g, ""),
  );

  // Slår opp firmadata i Brønnøysundregistrene (+ ev. telefonileverandør) fra
  // org.nr. Viser treffet i en forhåndsvisning og fyller inn skjemaet – men
  // overskriver aldri felt brukeren allerede har skrevet noe i selv.
  async function lookupOrgNumber() {
    const orgnr = form.org_number.replace(/\s/g, "");
    if (!isValidOrgNumber(orgnr)) {
      setLookupError("Ugyldig organisasjonsnummer (9 siffer med gyldig kontrollsiffer).");
      setLookup(null);
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    setLookup(null);
    try {
      const res = await fetch(`/api/customers/brreg?orgnr=${orgnr}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Fant ikke bedriften.");

      setLookup({
        orgnr,
        fields: j.fields,
        flags: j.flags ?? { konkurs: false, underAvvikling: false },
        notes: j.notes ?? [],
        existingCustomer: j.existingCustomer ?? null,
      });

      if (!j.existingCustomer) {
        setForm((f) => ({
          ...f,
          name: f.name || j.fields.name || "",
          contact_name: f.contact_name || j.fields.ceo_name || "",
          phone: f.phone || j.fields.phone || "",
          city: f.city || j.fields.city || "",
          address: f.address || j.fields.address || "",
          postal_code: f.postal_code || j.fields.postal_code || "",
        }));
      }
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Ukjent feil.");
    } finally {
      setLookupLoading(false);
    }
  }

  function update(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    // Org.nr endret for hånd etter et oppslag – forhåndsvisningen gjelder
    // ikke lenger det nye nummeret, så den ryddes bort til neste oppslag.
    if (field === "org_number") {
      setLookup(null);
      setLookupError(null);
    }
  }

  // Slå sammen uttrukne felter inn i skjemaet (behold eksisterende der
  // uttrekket er tomt).
  function applyFields(fields: ExtractedFields) {
    setForm((f) => ({
      ...f,
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
    setLookup(null);
    setLookupError(null);
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
    if (isDuplicate) {
      setError(
        "Dette organisasjonsnummeret er allerede registrert som kunde. Åpne den eksisterende kunden i stedet for å lagre en duplikat.",
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
        address: form.address || null,
        postal_code: form.postal_code || null,
        city: form.city || null,
        owner_id: user?.id ?? null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    setSaving(false);
    if (insErr) {
      // 23505 = unique_violation (org_number). Kan skje ved kappløp mellom to
      // selgere som lagrer samme bedrift samtidig, selv om forhåndsvisningen
      // ikke fanget det.
      setError(
        insErr.code === "23505"
          ? "Denne bedriften ble akkurat registrert som kunde av noen andre. Last siden på nytt for å finne den."
          : insErr.message,
      );
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
        <div className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="animate-panel-in max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-pop thin-scroll">
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
                  ["address", "Adresse"],
                  ["postal_code", "Postnr"],
                  ["city", "Sted"],
                ] as const
              ).map(([field, label]) => (
                <div key={field}>
                  <label className="mb-1 block text-sm text-slate-600">
                    {label}
                  </label>
                  {field === "org_number" ? (
                    <div className="flex gap-2">
                      <input
                        value={form.org_number}
                        onChange={(e) => update("org_number", e.target.value)}
                        placeholder="9 siffer"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      />
                      <button
                        type="button"
                        onClick={lookupOrgNumber}
                        disabled={lookupLoading}
                        title="Slå opp i Brønnøysundregistrene"
                        className="shrink-0 whitespace-nowrap rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                      >
                        {lookupLoading ? "Slår opp …" : "Slå opp"}
                      </button>
                    </div>
                  ) : field === "contact_name" && lookup?.fields.ceo_name ? (
                    <div>
                      <input
                        value={form.contact_name}
                        onChange={(e) => update("contact_name", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        Daglig leder «{lookup.fields.ceo_name}» hentet fra
                        Brønnøysundregistrene.
                      </p>
                    </div>
                  ) : (
                    <input
                      value={form[field]}
                      onChange={(e) => update(field, e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                  )}
                </div>
              ))}

              {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}

              {/* Forhåndsvisning av registertreffet, tydelig merket som ekstern kilde. */}
              {lookup && !lookup.existingCustomer && (
                <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                      <Icon name="building" size={15} />
                    </span>
                    <p className="text-sm font-semibold text-slate-800">
                      Treff i Brønnøysundregistrene
                    </p>
                  </div>
                  <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs text-slate-600">
                    <dt className="font-medium text-slate-500">Navn</dt>
                    <dd className="col-span-2">{lookup.fields.name || "–"}</dd>
                    <dt className="font-medium text-slate-500">Org.form</dt>
                    <dd className="col-span-2">{lookup.fields.org_form || "–"}</dd>
                    <dt className="font-medium text-slate-500">Bransje</dt>
                    <dd className="col-span-2">{lookup.fields.industry || "–"}</dd>
                    <dt className="font-medium text-slate-500">Daglig leder</dt>
                    <dd className="col-span-2">
                      {lookup.fields.ceo_name || "Ikke registrert"}
                    </dd>
                    <dt className="font-medium text-slate-500">Telefon</dt>
                    <dd className="col-span-2">
                      {lookup.fields.phone || "Ikke tilgjengelig"}
                    </dd>
                  </dl>
                  {(lookup.flags.konkurs || lookup.flags.underAvvikling) && (
                    <p className="mt-2 text-xs font-medium text-amber-600">
                      ⚠ {lookup.flags.konkurs && "Registrert konkurs. "}
                      {lookup.flags.underAvvikling && "Under avvikling."}
                    </p>
                  )}
                  {lookup.notes.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
                      {lookup.notes.map((n, i) => (
                        <li key={i}>· {n}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Duplikatvarsel: skiller tydelig fra et rent registertreff og
                  blokkerer lagring for å unngå utilsiktede duplikater. */}
              {lookup?.existingCustomer && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <Icon name="customers" size={15} />
                    </span>
                    <p className="text-sm font-semibold text-amber-900">
                      Allerede registrert som kunde
                    </p>
                  </div>
                  <p className="text-xs text-amber-800">
                    Org.nr {formatOrgNumber(lookup.orgnr)} finnes fra før:{" "}
                    <span className="font-medium">{lookup.existingCustomer.name}</span>
                    {lookup.existingCustomer.city ? ` (${lookup.existingCustomer.city})` : ""}
                    {lookup.existingCustomer.owner_name
                      ? `, eier: ${lookup.existingCustomer.owner_name}`
                      : ""}
                    .
                  </p>
                  <Link
                    href={`/customers/${lookup.existingCustomer.id}`}
                    className="mt-2 inline-block text-xs font-medium text-amber-900 underline hover:no-underline"
                  >
                    Åpne eksisterende kunde →
                  </Link>
                </div>
              )}

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
                disabled={saving || isDuplicate}
                title={isDuplicate ? "Denne bedriften er allerede en kunde." : undefined}
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
