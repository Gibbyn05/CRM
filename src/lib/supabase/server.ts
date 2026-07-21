import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase-klient for server-komponenter og route handlers. Leser/setter
// cookies for å opprettholde sesjon.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll kalt fra en Server Component — kan ignoreres når
            // middleware håndterer sesjonsfornyelse.
          }
        },
      },
    },
  );
}
