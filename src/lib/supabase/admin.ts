import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role klient. KUN på server (webhook, TV-visning, dagsavis-
// generering). Bypasser RLS — bruk med forsiktighet og aldri i klientkode.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        // Next.js kan ellers legge Supabase sine GET-kall i Data Cache, også
        // når API-ruten selv er dynamisk. Serviceklienten brukes til live- og
        // webhookdata, så serveren skal alltid lese siste databaseverdi.
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
          }),
      },
    },
  );
}
