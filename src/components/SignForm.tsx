"use client";

import { useState } from "react";
import SignedContractStamp from "./SignedContractStamp";

// Signeringsskjemaet på den offentlige avtalesiden. Kunden skriver fullt navn,
// huker av for aksept og signerer. Ved suksess vises en bekreftelse.
export default function SignForm({
  token,
  alreadySigned,
  initialSignerName,
  initialSignerEmail,
  initialSignerPhone,
  initialSignedAt,
  contractId,
}: {
  token: string;
  alreadySigned: boolean;
  initialSignerName: string | null;
  initialSignerEmail: string | null;
  initialSignerPhone: string | null;
  initialSignedAt: string | null;
  contractId: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialSignerEmail ?? "");
  const [phone, setPhone] = useState(initialSignerPhone ?? "");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(alreadySigned);
  const [signerName, setSignerName] = useState(initialSignerName ?? "");
  const [signerEmail, setSignerEmail] = useState(initialSignerEmail ?? "");
  const [signerPhone, setSignerPhone] = useState(initialSignerPhone ?? "");
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Skriv inn en gyldig e-postadresse.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      setError("Skriv inn et gyldig telefonnummer.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/signer/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Kunne ikke signere.");
      setSignerName(j.signer_name ?? name.trim());
      setSignerEmail(j.signer_email ?? email.trim());
      setSignerPhone(j.signer_phone ?? phone.trim());
      setSignedAt(j.signed_at ?? new Date().toISOString());
      setSigned(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke signere.");
    } finally {
      setSubmitting(false);
    }
  }

  if (signed) {
    return (
      <div className="border-t border-slate-100 bg-white px-6 py-6 sm:px-8 print:border-0 print:px-0">
        <SignedContractStamp
          signerName={signerName}
          signerEmail={signerEmail}
          signerPhone={signerPhone}
          signedAt={signedAt}
          contractId={contractId}
        />
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 w-full rounded-lg border border-emerald-700 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 print:hidden"
        >
          Skriv ut eller lagre som PDF
        </button>
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          E-post
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="ola@bedrift.no"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Telefon
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="99 99 99 99"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>

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
