import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Fornyer Supabase-sesjonen på hver request og beskytter ruter som krever
// innlogging. Robust mot manglende konfig/transiente feil: middleware skal
// aldri gi 500 på hele siden. Beskyttede sider dobbeltsjekker uansett auth
// server-side i (dashboard)/layout.tsx.
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Uten Supabase-konfig: hopp over sesjonshåndtering i stedet for å krasje.
  if (!url || !anonKey) {
    console.warn(
      "[middleware] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY mangler – hopper over sesjonshåndtering.",
    );
    return NextResponse.next({ request });
  }

  try {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;

    // Offentlige ruter: innlogging, TV-visning og dens avgrensede data-API-er
    // (kiosk), telefoni-webhook, samt kundens signeringsside/-API. Ikke gjør
    // hele /api/tv offentlig, bare endepunktene tavlen faktisk leser.
    const isPublic =
      path.startsWith("/login") ||
      path === "/accept-invite" ||
      path === "/api/auth/invitations" ||
      path.startsWith("/tv") ||
      path === "/api/live-board" ||
      path === "/api/tv/sales" ||
      path.startsWith("/signer") ||
      path.startsWith("/api/signer") ||
      path.startsWith("/api/telephony") ||
      // Vercel Cron har ikke en Supabase-nettlesersesjon. Endepunktet
      // validerer selv CRON_SECRET før det gjør noe med leadene.
      path === "/api/reachr/daily-leads";

    if (!user && !isPublic) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      return NextResponse.redirect(redirectUrl);
    }

    return supabaseResponse;
  } catch (err) {
    // Transient feil (nettverk/konfig) skal ikke ta ned hele siden.
    console.error("[middleware] Sesjonssjekk feilet:", err);
    return NextResponse.next({ request });
  }
}
