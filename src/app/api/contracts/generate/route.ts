import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { formatCurrency } from "@/lib/format";

// ============================================================================
//  POST /api/contracts/generate
//  Lager et kontraktforslag ut fra produkt(er), kundeinfo og bedriftsinfo.
//  Bruker OpenAI når OPENAI_API_KEY er satt; ellers en ryddig mal (fail-safe).
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 30;

interface Line {
  name: string;
  quantity: number;
  unit_price: number;
}

interface Body {
  customer?: { name?: string; org_number?: string | null; contact_name?: string | null; address?: string | null };
  org?: { name?: string; org_number?: string | null; address?: string | null };
  seller?: string;
  lines?: Line[];
  title?: string;
}

function templateContract(b: Body): string {
  const c = b.customer ?? {};
  const o = b.org ?? {};
  const lines = b.lines ?? [];
  const total = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const linesText = lines
    .map(
      (l) =>
        `  • ${l.quantity} × ${l.name} – ${formatCurrency(l.unit_price)} pr. stk = ${formatCurrency(l.unit_price * l.quantity)}`,
    )
    .join("\n");

  return `AVTALE${b.title ? ` – ${b.title}` : ""}

Mellom
  Leverandør: ${o.name || "—"}${o.org_number ? ` (org.nr ${o.org_number})` : ""}${o.address ? `, ${o.address}` : ""}
og
  Kunde: ${c.name || "—"}${c.org_number ? ` (org.nr ${c.org_number})` : ""}${c.address ? `, ${c.address}` : ""}${c.contact_name ? `\n  Kontaktperson: ${c.contact_name}` : ""}

1. LEVERANSE
Leverandøren skal levere følgende produkter/tjenester:
${linesText || "  • (ingen produkter valgt)"}

2. PRIS OG BETALING
Total avtalt pris er ${formatCurrency(total)}. Beløpet faktureres etter at
avtalen er signert, med betalingsfrist 14 dager fra fakturadato.

3. VARIGHET
Avtalen trer i kraft ved signering og løper etter avtalt periode for hvert
produkt. Ved løpende tjenester fornyes avtalen automatisk med mindre den sies
opp skriftlig med én måneds varsel.

4. PARTENES PLIKTER
Leverandøren leverer tjenestene fagmessig og til avtalt tid. Kunden bidrar med
nødvendig informasjon og tilganger for gjennomføring.

5. ANSVAR
Leverandørens ansvar er begrenset til avtalt vederlag. Ingen av partene er
ansvarlig for indirekte tap.

6. SIGNATUR
Ved signering aksepterer partene vilkårene over.

Sted/dato: _______________________

For leverandøren: _______________________   ${b.seller ? `(${b.seller})` : ""}

For kunden: _______________________`;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, {
    name: "contracts:generate",
    limit: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const fallback = templateContract(body);

  // Uten OpenAI-nøkkel: returner malen (fungerer fint, bare ikke «AI»).
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ contract: fallback, ai: false });
  }

  try {
    const prompt = `Du er en norsk juridisk assistent. Skriv et ryddig, profesjonelt norsk avtale-/kontraktforslag (ikke bruk markdown, bare ren tekst) basert på dataene under. Ta med parter, leveranse (produktene), pris og betaling, varighet, partenes plikter, ansvar og signaturfelt. Vær konkret men kortfattet.

Data (JSON):
${JSON.stringify(body, null, 2)}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ contract: fallback, ai: false });
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    return NextResponse.json({ contract: text || fallback, ai: Boolean(text) });
  } catch {
    return NextResponse.json({ contract: fallback, ai: false });
  }
}
