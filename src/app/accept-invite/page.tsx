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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    if (password.length < 8) return setError("Passordet må være minst åtte tegn.");
    if (password !== confirmPassword) return setError("Passordene er ikke like.");
    setSaving(true);
    try {
      const response = await fetch("/api/auth/invitations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", token, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Kontoen kunne ikke aktiveres.");
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: result.email, password });
      if (signInError) throw new Error("Kontoen er aktivert. Gå til innlogging og bruk det nye passordet.");
      router.replace("/dashboard");
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
        <p className="mb-8 text-xl font-black tracking-tight text-slate-900">Reachr</p>
        {loading ? <p className="text-slate-600">Kontrollerer invitasjonen …</p> : error && !info ? (
          <div><h1 className="text-2xl font-bold text-slate-900">Invitasjonen kan ikke brukes</h1><p className="mt-3 leading-6 text-slate-600">{error}</p><Link href="/login" className="mt-6 inline-block font-semibold text-emerald-700">Gå til innlogging</Link></div>
        ) : info ? (
          <form onSubmit={submit}>
            <h1 className="text-2xl font-bold text-slate-900">Aktiver kontoen din</h1>
            <p className="mt-2 text-slate-600">Hei {info.full_name}. Du er invitert som {info.role === "manager" ? "leder" : "selger"}.</p>
            <p className="mt-1 text-sm text-slate-500">{info.email}</p>
            <label className="mt-7 block text-sm font-semibold text-slate-700" htmlFor="password">Nytt passord</label>
            <input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            <label className="mt-4 block text-sm font-semibold text-slate-700" htmlFor="confirm-password">Bekreft passord</label>
            <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            <p className="mt-2 text-xs text-slate-500">Minst åtte tegn.</p>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button disabled={saving} className="mt-6 w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? "Aktiverer …" : "Aktiver konto"}</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

export default function AcceptInvitePage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#f5efe2]" />}><AcceptInviteForm /></Suspense>;
}
