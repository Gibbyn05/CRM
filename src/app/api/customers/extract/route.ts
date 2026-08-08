import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

// ============================================================================
//  Trekk ut kundeopplysninger fra fritekst eller et bilde (visittkort,
//  skjermbilde, e-postsignatur) med OpenAI. Returnerer felter som klienten
//  fyller inn i "Ny kunde"-skjemaet. Skriver ingenting til databasen.
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_IMAGE = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

interface Body {
  text?: string;
  image?: { media_type?: string; data?: string };
}

export interface ExtractedFields {
  name: string;
  org_number: string;
  contact_name: string;
  email: string;
  phone: string;
  city: string;
}

const SYSTEM = `Du er en assistent som trekker ut norske bedrifts-/kundeopplysninger fra tekst eller bilder (visittkort, e-postsignaturer, skjermbilder).

Returner KUN et JSON-objekt – ingen forklaring, ingen kodeblokk – med nøyaktig disse feltene:
{"name":"","org_number":"","contact_name":"","email":"","phone":"","city":""}

Regler:
- name: bedriftens/kundens navn. Er ikke firmanavnet oppgitt eksplisitt, men e-postadressen har et tydelig bedriftsdomene (f.eks. kjell@oslobil.no), utled et lesbart firmanavn ("Oslo Bil"). Er du usikker, la stå tomt.
- org_number: norsk organisasjonsnummer, kun de 9 sifrene, uten mellomrom. Tomt hvis ikke oppgitt.
- contact_name: navn på kontaktpersonen.
- email: e-postadressen, i små bokstaver.
- phone: telefonnummer slik det står (behold sifre, evt. +47).
- city: poststed/sted.
- Bruk tom streng ("") for felt du ikke finner. Ikke finn på verdier.`;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  }

  const limited = await enforceRateLimit(req, {
    name: "customers:extract",
    limit: 15,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Automatisk utfylling er ikke konfigurert (mangler OPENAI_API_KEY)." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const hasText = !!body.text?.trim();
  const hasImage = !!body.image?.data;
  if (!hasText && !hasImage) {
    return NextResponse.json(
      { error: "Oppgi tekst eller et bilde." },
      { status: 400 },
    );
  }

  // Bygg innholdet til OpenAI (tekst og/eller bilde, vision-format).
  type OpenAIPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };
  const content: OpenAIPart[] = [];
  content.push({
    type: "text",
    text: hasText
      ? `Trekk ut kundeopplysninger fra denne teksten:\n\n${body.text!.trim()}`
      : "Trekk ut kundeopplysninger fra bildet.",
  });
  if (hasImage) {
    const mt = body.image!.media_type ?? "image/png";
    if (!ALLOWED_IMAGE.has(mt)) {
      return NextResponse.json(
        { error: "Bildeformatet støttes ikke (bruk JPG, PNG, GIF eller WEBP)." },
        { status: 400 },
      );
    }
    content.push({
      type: "image_url",
      image_url: { url: `data:${mt};base64,${body.image!.data!}` },
    });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 400,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: "Feil ved analyse: " + detail },
        { status: 502 },
      );
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = (json.choices?.[0]?.message?.content ?? "").trim();

    const fields = parseFields(raw);
    if (!fields) {
      return NextResponse.json(
        { error: "Klarte ikke å tolke opplysningene." },
        { status: 422 },
      );
    }
    return NextResponse.json({ fields });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukjent feil";
    return NextResponse.json(
      { error: "Feil ved analyse: " + msg },
      { status: 502 },
    );
  }
}

// (typeimport ligger øverst)

// Robust JSON-parsing: takler evt. kodeblokk eller omkringliggende tekst.
function parseFields(raw: string): ExtractedFields | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return {
      name: s(obj.name),
      org_number: s(obj.org_number).replace(/\s+/g, ""),
      contact_name: s(obj.contact_name),
      email: s(obj.email).toLowerCase(),
      phone: s(obj.phone),
      city: s(obj.city),
    };
  } catch {
    return null;
  }
}
