"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: false },
    });

    setLoading(false);
    if (otpError) {
      setError("Kunne ikke sende en innloggingskode. Kontroller e-postadressen og prøv igjen.");
      return;
    }

    setEmail(normalizedEmail);
    setStep("code");
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });

    setLoading(false);
    if (verifyError) {
      setError("Koden er feil eller har utløpt. Be om en ny kode og prøv igjen.");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-pop">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Media Norge CRM</h1>
            <p className="text-sm text-slate-500">Logg inn med en kode på e-post</p>
          </div>
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">E-post</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" placeholder="navn@firma.no" />
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50">
              {loading ? "Sender kode …" : "Send innloggingskode"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">Vi har sendt en engangskode til <strong>{email}</strong>.</p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="code">Engangskode</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-xl tracking-[0.35em] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" placeholder="000000" />
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading || code.length !== 6} className="w-full rounded-lg bg-brand-600 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50">
              {loading ? "Kontrollerer kode …" : "Logg inn"}
            </button>
            <button type="button" onClick={() => { setStep("email"); setCode(""); setError(null); }} className="w-full py-1 text-sm font-medium text-brand-700 hover:text-brand-800">
              Bruk en annen e-postadresse
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
