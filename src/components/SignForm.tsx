"use client";

import { useState } from "react";

// Signeringsskjemaet på den offentlige avtalesiden. Kunden skriver fullt navn,
// huker av for aksept og signerer. Ved suksess vises en bekreftelse.
export default function SignForm({
  token,
  alreadySigned,
  initialSignerName,
  initialSignedAt,
}: {
  token: string;
  alreadySigned: boolean;
  initialSignerName: string | null;
  initialSignedAt: string | null;
}) {
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(alreadySigned);
  const [signerName, setSignerName] = useState(initialSignerName ?? "");
  const [signedAt, setSignedAt] = useState(initialSignedAt ?? "");

  async function submit() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Skriv inn fullt navn.");
      return;
    }
    if (!accepted) {
      setError("Du må bekrefte at du aksepterer avtalen.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/signer/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Kunne ikke signere.");
      setSignerName(j.signer_name ?? name.trim());
      setSignedAt(j.signed_at ?? new Date().toISOString());
      setSigned(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke signere.");
    } finally {
      setSubmitting(false);
    }
  }

  if (signed) {
    const when = signedAt
      ? new Date(signedAt).toLocaleString("nb-NO", {
          dateStyle: "long",
          timeStyle: "short",
        })
      : "";
    return (
      <div className="border-t border-slate-100 bg-emerald-50 px-6 py-8 text-center sm:px-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white">
          ✓
        </div>
        <h2 className="mt-3 text-lg font-bold text-emerald-900">
          Avtalen er signert
        </h2>
        <p className="mt-1 text-sm text-emerald-800">
          Takk{signerName ? `, ${signerName}` : ""}! Signaturen er registrert
          {when ? ` ${when}` : ""}.
        </p>
        <p className="mt-3 text-xs text-emerald-700">
          Du kan lukke denne siden. En bekreftelse er sendt til avsenderen.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-6 py-6 sm:px-8">
      <label className="block text-sm font-medium text-slate-700">
        Fullt navn
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ola Nordmann"
          autoComplete="name"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <label className="mt-4 flex items-start gap-2.5 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
        />
        <span>
          Jeg har lest avtalen og aksepterer vilkårene. Jeg forstår at dette er
          en juridisk bindende elektronisk signatur.
        </span>
      </label>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitting ? "Signerer …" : "Signer avtalen"}
      </button>
    </div>
  );
}
