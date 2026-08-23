import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Fornyer Supabase-sesjonen på hver request og beskytter ruter som krever
// innlogging. Beskyttede sider dobbeltsjekker også auth server-side i
// (dashboard)/layout.tsx.
export async function updateSession(request: NextRequest) {
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

  const denyWhenAuthUnavailable = () => {
    if (isPublic) {
      return NextResponse.next({ request });
    }

    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Kunne ikke bekrefte innloggingen. Prøv igjen snart." },
        { status: 503 },
      );
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // En feilkonfigurert eller utilgjengelig auth-tjeneste må aldri gi adgang
  // til beskyttede ruter.
  if (!url || !anonKey) {
    console.warn(
      "[middleware] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY mangler.",
    );
    return denyWhenAuthUnavailable();
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

    if (!user && !isPublic) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      return NextResponse.redirect(redirectUrl);
    }

    // En deaktivert konto kan ha et kortvarig, allerede utstedt tilgangstoken.
    // Blokker API-kall også i det vinduet, i tillegg til at dashboard-layouten
    // viser deaktiveringsskjermen for vanlige sider.
    if (user && !isPublic && path.startsWith("/api/")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.is_active) {
        return NextResponse.json({ error: "Kontoen er deaktivert." }, { status: 403 });
      }
    }

    return supabaseResponse;
  } catch (err) {
    // En auth-feil må ikke bli en omvei rundt tilgangskontrollen. Offentlige
    // ruter kan fortsette, men alt annet stoppes inntil auth kan bekreftes.
    console.error("[middleware] Sesjonssjekk feilet:", err);
    return denyWhenAuthUnavailable();
  }
}
