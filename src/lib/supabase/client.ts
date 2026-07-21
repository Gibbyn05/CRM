"use client";

import { createBrowserClient } from "@supabase/ssr";

// Supabase-klient for bruk i klientkomponenter (Realtime-abonnement m.m.).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
