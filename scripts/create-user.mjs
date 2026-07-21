// ============================================================================
//  Oppretter en innloggingsbruker i Supabase Auth.
//
//  Bruk (kjør fra prosjektmappa, med .env.local utfylt):
//    node scripts/create-user.mjs <epost> <passord> "<Fullt navn>" [manager|agent]
//
//  Eksempel:
//    node scripts/create-user.mjs sjef@firma.no HemmeligPassord123 "Kari Nordmann" manager
//
//  Krever at NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY er satt i
//  .env.local. Skriptet leser den fila selv.
// ============================================================================

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Enkel .env.local-parser (unngår ekstra avhengighet).
function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local finnes ikke — bruk eksisterende miljøvariabler.
  }
}

loadEnv();

const [, , email, password, fullName = "", role = "agent"] = process.argv;

if (!email || !password) {
  console.error(
    'Bruk: node scripts/create-user.mjs <epost> <passord> "<Fullt navn>" [manager|agent]',
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || url.includes("DIN-PROSJEKT-REF")) {
  console.error(
    "Mangler NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY i .env.local.",
  );
  process.exit(1);
}

if (role !== "manager" && role !== "agent") {
  console.error('Rolle må være "manager" eller "agent".');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // hopp over e-postbekreftelse
  user_metadata: { full_name: fullName, role },
});

if (error) {
  console.error("Kunne ikke opprette bruker:", error.message);
  process.exit(1);
}

console.log(`✓ Bruker opprettet: ${email} (rolle: ${role})`);
console.log(`  ID: ${data.user.id}`);
console.log("  Du kan nå logge inn i appen med denne e-posten og passordet.");
