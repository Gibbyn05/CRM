import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  checkFikenConnection,
  findContactByOrgNumber,
  createContact,
  createInvoiceDraft,
  type DraftLine,
} from "@/lib/fiken";

// ============================================================================
//  POST /api/salg/invoice   body: { deal_id }
//  Lager et faktura-UTKAST i Fiken ut fra tilbudet (produktlinjer/beløp +
//  kunde), og returnerer en lenke til Fiken der lederen/selgeren godkjenner og
//  sender fakturaen. Tillatt for tilbudets eier eller ledere.
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, {
    name: "salg:invoice",
    limit: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  let dealId: string | undefined;
  try {
    ({ deal_id: dealId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }
  if (!dealId) {
    return NextResponse.json({ error: "deal_id er påkrevd" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: deal } = await admin
    .from("deals")
    .select(
      "id, title, amount, agent_id, customer_id, customer:customers(name, org_number, email, phone, fiken_contact_id)",
    )
    .eq("id", dealId)
    .single();
  if (!deal) {
    return NextResponse.json({ error: "Fant ikke tilbudet" }, { status: 404 });
  }
  if (me?.role !== "manager" && deal.agent_id !== user.id) {
    return NextResponse.json({ error: "Ikke tilgang" }, { status: 403 });
  }

  const customer = (Array.isArray(deal.customer)
    ? deal.customer[0]
    : deal.customer) as {
    name: string | null;
    org_number: string | null;
    email: string | null;
    phone: string | null;
    fiken_contact_id: number | null;
  } | null;
  if (!customer) {
    return NextResponse.json(
      { error: "Tilbudet mangler kunde." },
      { status: 400 },
    );
  }

  // Verifiser Fiken-tilkobling (gir tydelig grunn om token er feil).
  const conn = await checkFikenConnection();
  if (!conn.ok) {
    return NextResponse.json({ error: `Fiken: ${conn.error}` }, { status: 502 });
  }

  const { data: items } = await admin
    .from("deal_items")
    .select("name, unit_price, quantity")
    .eq("deal_id", dealId);

  const vatType = process.env.FIKEN_VAT_TYPE || "HIGH";
  const incomeAccount = process.env.FIKEN_INCOME_ACCOUNT || "3000";
  const dueDays = Number(process.env.FIKEN_DUE_DAYS || "14");

  const rows = (items as { name: string; unit_price: number; quantity: number }[]) ?? [];
  const lines: DraftLine[] =
    rows.length > 0
      ? rows.map((r) => ({
          productName: r.name,
          unitPriceOre: Math.round(Number(r.unit_price) * 100),
          quantity: r.quantity,
          vatType,
          incomeAccount,
        }))
      : [
          {
            productName: deal.title || "Salg",
            unitPriceOre: Math.round(Number(deal.amount ?? 0) * 100),
            quantity: 1,
            vatType,
            incomeAccount,
          },
        ];

  // Provisjonsraden for dette salget (lages av trigger når deal blir «akseptert»).
  // Vi kobler fakturaen til den slik at betaling i Fiken senere flyter til
  // «Min inntekt». Finnes den, bruker vi commission-id som orderReference –
  // da matcher Fiken-synkroniseringen den likt som leder-flyten.
  const { data: commission } = await admin
    .from("commissions")
    .select("id, status")
    .eq("deal_id", dealId)
    .maybeSingle();

  try {
    // Finn/opprett Fiken-kontakt for kunden.
    let contactId = customer.fiken_contact_id ?? null;
    if (!contactId && customer.org_number) {
      const found = await findContactByOrgNumber(customer.org_number);
      if (found) contactId = found.contactId;
    }
    if (!contactId) {
      contactId = await createContact({
        name: customer.name ?? "Ukjent kunde",
        organizationNumber: customer.org_number,
        email: customer.email,
        phoneNumber: customer.phone,
      });
    }
    if (!contactId) {
      return NextResponse.json(
        { error: "Klarte ikke å finne/opprette kunde i Fiken." },
        { status: 502 },
      );
    }

    const draftUuid = await createInvoiceDraft({
      customerId: contactId,
      daysUntilDueDate: dueDays,
      orderReference: commission?.id ?? dealId,
      lines,
    });

    // Lagre kontakt-koblingen på kunden.
    if (deal.customer_id) {
      await admin
        .from("customers")
        .update({ fiken_contact_id: contactId })
        .eq("id", deal.customer_id);
    }

    // Marker provisjonsraden som fakturert (utkast finnes) + lagre koblinger,
    // slik at den kommer med i Fiken-synkroniseringen og til slutt «betalt».
    if (commission && commission.status === "ikke_fakturert") {
      await admin
        .from("commissions")
        .update({
          status: "fakturert",
          invoiced_at: new Date().toISOString(),
          fiken_contact_id: contactId,
          fiken_draft_uuid: draftUuid,
        })
        .eq("id", commission.id);
    }

    return NextResponse.json({
      ok: true,
      draft_uuid: draftUuid,
      fiken_url: `https://fiken.no/foretak/${conn.slug}`,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Ukjent feil";
    console.error("Fiken-faktura (salg) feilet:", m);
    return NextResponse.json({ error: m }, { status: 502 });
  }
}
