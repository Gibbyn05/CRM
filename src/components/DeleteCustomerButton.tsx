"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Sletting av kunde. Vises kun for ledere (server-siden avgjør dette), og RLS
// håndhever i tillegg at kun ledere faktisk får slette.
export default function DeleteCustomerButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", customerId);
    if (error) {
      setBusy(false);
      setError("Kunne ikke slette kunden. " + error.message);
      return;
    }
    router.push("/customers");
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
      >
        Slett kunde
      </button>

      {open && (
        <div className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="animate-panel-in w-full max-w-md rounded-2xl bg-white p-6 shadow-pop">
            <h2 className="text-lg font-bold text-slate-900">Slette kunde?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Er du sikker på at du vil slette{" "}
              <span className="font-semibold text-slate-900">{customerName}</span>?
              Notater, avtaler og kontrakter knyttet til kunden fjernes også.
              Dette kan ikke angres.
            </p>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Sletter …" : "Slett kunde"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
