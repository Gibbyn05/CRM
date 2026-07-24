"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isValidOrgNumber } from "@/lib/format";

// Enkelt skjema (modal) for å opprette ny kunde.
export default function NewCustomerButton() {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    org_number: "",
    contact_name: "",
    email: "",
    phone: "",
    city: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save() {
    setError(null);
    if (!form.name.trim()) {
      setError("Navn er påkrevd.");
      return;
    }
    if (form.org_number && !isValidOrgNumber(form.org_number)) {
      setError("Ugyldig organisasjonsnummer (må være 9 siffer med gyldig kontrollsiffer).");
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
    setOpen(false);
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
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold">Ny kunde</h2>
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

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
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
