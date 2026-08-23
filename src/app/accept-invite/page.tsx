"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type InviteInfo = { full_name: string; email: string; role: "agent" | "manager"; expires_at: string };

function AcceptInviteForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function inspect() {
      if (!token) {
        setError("Invitasjonslenken mangler et gyldig token. Kontakt lederen din.");
        setLoading(false);
        return;
      }
      const response = await fetch("/api/auth/invitations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "inspect", token }),
      });
      const result = await response.json();
      if (!active) return;
      if (!response.ok) setError(result.error ?? "Invitasjonen kunne ikke åpnes.");
      else setInfo(result);
      setLoading(false);
    }
    void inspect();
    return () => { active = false; };
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setError("Skriv inn fullt navn.");
    setSaving(true);
    try {
      const response = await fetch("/api/auth/invitations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", token, full_name: fullName.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Kontoen kunne ikke aktiveres.");
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: result.email,
        options: { shouldCreateUser: false },
      });
      if (otpError) throw new Error("Kontoen er aktivert, men innloggingskoden kunne ikke sendes. Gå til innlogging og prøv igjen.");
      setCodeSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ukjent feil.");
    } finally {
      setSaving(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!info) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: info.email,
        token: code.trim(),
        type: "email",
      });
      if (verifyError) throw new Error("Koden er feil eller har utløpt. Be om en ny kode og prøv igjen.");
      router.replace("/profile?setup=1");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ukjent feil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5efe2] p-5">
      <section className="w-full max-w-md rounded-3xl border border-[#dfd0b7] bg-[#fffaf0] p-8 shadow-xl">
        <p className="mb-8 text-xl font-black tracking-tight text-slate-900">Media Norge CRM</p>
        {loading ? <p className="text-slate-600">Kontrollerer invitasjonen …</p> : error && !info ? (
          <div><h1 className="text-2xl font-bold text-slate-900">Invitasjonen kan ikke brukes</h1><p className="mt-3 leading-6 text-slate-600">{error}</p><Link href="/login" className="mt-6 inline-block font-semibold text-emerald-700">Gå til innlogging</Link></div>
        ) : info ? (
          codeSent ? (
            <form onSubmit={verifyCode}>
              <h1 className="text-2xl font-bold text-slate-900">Skriv inn koden</h1>
              <p className="mt-2 text-slate-600">Vi har sendt en engangskode til {info.email}.</p>
              <label className="mt-7 block text-sm font-semibold text-slate-700" htmlFor="code">Engangskode</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-xl tracking-[0.35em] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="000000" />
              {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button disabled={saving || code.length !== 6} className="mt-6 w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? "Kontrollerer …" : "Logg inn"}</button>
            </form>
          ) : (
            <form onSubmit={submit}>
            <h1 className="text-2xl font-bold text-slate-900">Aktiver kontoen din</h1>
            <p className="mt-2 text-slate-600">Du er invitert som {info.role === "manager" ? "leder" : "selger"}. Start med å sette opp profilen din.</p>
            <p className="mt-1 text-sm text-slate-500">{info.email}</p>
            <label className="mt-7 block text-sm font-semibold text-slate-700" htmlFor="full-name">Fullt navn</label>
            <input id="full-name" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            <p className="mt-2 text-xs text-slate-500">Du logger inn med en ny engangskode på e-post hver gang du er logget ut.</p>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={saving} className="mt-6 w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? "Aktiverer …" : "Aktiver konto og send kode"}</button>
            </form>
          )
        ) : null}
      </section>
    </main>
  );
}

export default function AcceptInvitePage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#f5efe2]" />}><AcceptInviteForm /></Suspense>;
}
