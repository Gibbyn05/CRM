"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Blokkerer hele appen for en deaktivert bruker. Vises i stedet for dashbordet
// når profiles.is_active = false.
export default function DeactivatedScreen() {
  const supabase = createClient();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-slate-900">Kontoen er deaktivert</h1>
        <p className="mt-2 text-sm text-slate-500">
          Kontoen din er deaktivert av en administrator. Ta kontakt med lederen
          din hvis dette er en feil.
        </p>
        <button
          onClick={signOut}
          className="mt-6 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Logg ut
        </button>
      </div>
    </div>
  );
}
