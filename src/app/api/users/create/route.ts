import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";

// ============================================================================
//  Opprett en ny bruker (kun ledere). Lederen setter navn, rolle og passord
//  manuelt – ingen e-postinvitasjon. Profilen opprettes automatisk av
//  handle_new_user-triggeren fra user_metadata.
// ============================================================================

interface Body {
  full_name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  // Kun ledere kan opprette brukere.
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((me as { role: UserRole } | null)?.role !== "manager") {
    return NextResponse.json({ error: "Kun ledere kan opprette brukere." }, {
      status: 403,
    });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Brukeroppretting er ikke konfigurert (mangler SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const fullName = body.full_name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const role: UserRole = body.role === "manager" ? "manager" : "agent";

  if (!fullName) {
    return NextResponse.json({ error: "Navn er påkrevd." }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Ugyldig e-postadresse." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Passordet må være minst 8 tegn." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });

  if (error) {
    // Vanligste feil: e-post finnes allerede.
    const msg = /already been registered|already exists/i.test(error.message)
      ? "En bruker med denne e-posten finnes allerede."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true, user_id: data.user?.id ?? null });
}
