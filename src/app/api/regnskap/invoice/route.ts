import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  isFikenConfigured,
  findContactByOrgNumber,
  createContact,
  createInvoiceDraft,
} from "@/lib/fiken";

// ============================================================================
//  POST /api/regnskap/invoice   body: { commission_id }
//  Oppretter et faktura-UTKAST i Fiken for en provisjonsrad (kun ledere).
//  Vi lager BEVISST kun et utkast – lederen godkjenner og sender selv i Fiken,
//  så ekte fakturering aldri skjer uten et menneske i loopen.
//
//  Regnskaps-standarder (kan overstyres via miljøvariabler):
//    FIKEN_VAT_TYPE       – MVA-type, default "HIGH" (25 %)
//    FIKEN_INCOME_ACCOUNT – inntektskonto, default "3000"
//    FIKEN_DUE_DAYS       – forfall i dager, default 14
//  Beløpet fra CRM-en behandles som nettobeløp (eks. mva).
// ============================================================================

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, {
    name: "regnskap:invoice",
    limit: 30,
    windowSeconds: 60,
  });
  if (limited) return limited;

  // Må være innlogget leder.
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
  if (me?.role !== "manager") {
    return NextResponse.json({ error: "Kun ledere" }, { status: 403 });
  }

  if (!isFikenConfigured()) {
    return NextResponse.json(
      { error: "Fiken er ikke koblet til ennå (mangler API-nøkkel)." },
      { status: 503 },
    );
  }

  let commissionId: string | undefined;
  try {
    ({ commission_id: commissionId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }
  if (!commissionId) {
    return NextResponse.json(
      { error: "commission_id er påkrevd" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: c } = await admin
    .from("commissions")
    .select(
      "id, sale_amount, status, customer_id, fiken_contact_id, deal:deals(title), customer:customers(name, org_number, email, phone, fiken_contact_id)",
    )
    .eq("id", commissionId)
    .single();

  if (!c) {
    return NextResponse.json({ error: "Fant ikke salget" }, { status: 404 });
  }
  if (c.status !== "ikke_fakturert") {
    return NextResponse.json(
      { error: "Salget er allerede fakturert." },
      { status: 409 },
    );
  }

  // Supabase typer to-en-relasjoner som array; hent første element.
  const customer = (Array.isArray(c.customer)
    ? c.customer[0]
    : c.customer) as {
    name: string | null;
    org_number: string | null;
    email: string | null;
    phone: string | null;
    fiken_contact_id: number | null;
  } | null;
  const deal = (Array.isArray(c.deal) ? c.deal[0] : c.deal) as {
    title: string | null;
  } | null;

  if (!customer) {
    return NextResponse.json(
      { error: "Salget mangler kunde – kan ikke fakturere." },
      { status: 400 },
    );
  }

  try {
    // 1) Finn/opprett Fiken-kontakt for kunden.
    let contactId =
      c.fiken_contact_id ?? customer.fiken_contact_id ?? null;
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

    // 2) Opprett faktura-utkast (netto beløp = eks. mva).
    const vatType = process.env.FIKEN_VAT_TYPE || "HIGH";
    const incomeAccount = process.env.FIKEN_INCOME_ACCOUNT || "3000";
    const dueDays = Number(process.env.FIKEN_DUE_DAYS || "14");
    const unitPriceOre = Math.round(Number(c.sale_amount) * 100);

    const draftUuid = await createInvoiceDraft({
      customerId: contactId,
      daysUntilDueDate: dueDays,
      orderReference: commissionId,
      lines: [
        {
          productName: deal?.title || "Salg",
          unitPriceOre,
          quantity: 1,
          vatType,
          incomeAccount,
        },
      ],
    });

    // 3) Oppdater CRM: marker som fakturert (utkast finnes) + lagre kobling.
    await admin
      .from("commissions")
      .update({
        status: "fakturert",
        invoiced_at: new Date().toISOString(),
        fiken_contact_id: contactId,
        fiken_draft_uuid: draftUuid,
      })
      .eq("id", commissionId);

    // Lagre kontakt-koblingen på kunden for gjenbruk.
    if (c.customer_id) {
      await admin
        .from("customers")
        .update({ fiken_contact_id: contactId })
        .eq("id", c.customer_id);
    }

    return NextResponse.json({ ok: true, draft_uuid: draftUuid });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Ukjent feil";
    console.error("Fiken-fakturautkast feilet:", m);
    return NextResponse.json({ error: m }, { status: 502 });
  }
}
