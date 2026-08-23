import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generateOpenAIText } from "@/lib/openai";
import {
  CONTRACT_PLACEHOLDERS,
  fillContractPlaceholders,
} from "@/lib/contract-placeholders";

export const runtime = "nodejs";
export const maxDuration = 45;

interface LineInput {
  product_id?: string | null;
  name?: string;
  description?: string | null;
  quantity?: number;
  unit_price?: number;
  billing_type?: "engang" | "lopende";
  agreement_start?: string;
  agreement_end?: string;
}

interface Body {
  customer_id?: string;
  template_id?: string;
  title?: string;
  lines?: LineInput[];
  details?: {
    agreement_period?: string;
    start_date?: string;
    end_date?: string;
    payment_terms?: string;
    invoice_address?: string;
    discount?: string;
    one_time_amount?: string;
    monthly_amount?: string;
  };
}

const FIELD_LABELS: Record<string, string> = {
  customer_name: "Kundenavn / bedriftsnavn",
  organization_number: "Organisasjonsnummer",
  contact_name: "Kontaktperson",
  email: "E-post",
  phone: "Telefonnummer",
  invoice_address: "Fakturaadresse",
  product: "Produkt eller tjeneste",
  price: "Pris",
  agreement_period: "Avtaleperiode",
  start_date: "Oppstartsdato",
  end_date: "Avtalens sluttdato",
  payment_terms: "Betalingsbetingelser",
};

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" }).format(value);
}

function date(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("nb-NO").format(new Date(`${value}T12:00:00`));
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const limited = await enforceRateLimit(req, {
    name: "contracts:generate",
    limit: 20,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }
  if (!body.customer_id || !body.template_id || !body.lines?.length) {
    return NextResponse.json(
      { error: "Kunde, kontraktsmal og minst én produktlinje er påkrevd." },
      { status: 400 },
    );
  }

  const [{ data: customer }, { data: template }, { data: org }, { data: seller }] =
    await Promise.all([
      supabase.from("customers").select("id, name, org_number, contact_name, email, phone, address, postal_code, city").eq("id", body.customer_id).single(),
      supabase.from("contract_templates").select("id, name, template_text, is_active").eq("id", body.template_id).single(),
      supabase.from("organization").select("name, org_number, email, phone, address, postal_code, city").eq("id", 1).single(),
      supabase.from("profiles").select("full_name, email, phone").eq("id", user.id).single(),
    ]);

  if (!customer) return NextResponse.json({ error: "Fant ikke kunden eller du mangler tilgang." }, { status: 404 });
  if (!template?.is_active || !template.template_text?.trim()) {
    return NextResponse.json({ error: "Kontraktsmalen er deaktivert eller mangler maltekst." }, { status: 400 });
  }

  const details = body.details ?? {};
  const invoiceAddress = details.invoice_address?.trim() || [
    customer.address,
    [customer.postal_code, customer.city].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  const total = body.lines.reduce(
    (sum, line) => sum + Number(line.unit_price || 0) * Math.max(1, Number(line.quantity || 1)),
    0,
  );
  const recurring = body.lines.filter((line) => line.billing_type === "lopende");
  const oneTime = body.lines.filter((line) => line.billing_type !== "lopende");
  const firstStart = details.start_date?.trim() || body.lines.find((line) => line.agreement_start)?.agreement_start || "";
  const agreementEnd = details.end_date?.trim() || (() => {
    const ends = body.lines.map((line) => line.agreement_end).filter(Boolean) as string[];
    return ends.sort().at(-1) || "";
  })();
  const period = details.agreement_period?.trim() || (() => {
    const starts = body.lines.map((line) => line.agreement_start).filter(Boolean) as string[];
    const ends = body.lines.map((line) => line.agreement_end).filter(Boolean) as string[];
    return starts.length && ends.length ? `${starts.sort()[0]} til ${ends.sort().at(-1)}` : "";
  })();

  const values = {
    contract_title: body.title?.trim() || template.name,
    customer_name: customer.name?.trim() || "",
    organization_number: customer.org_number?.trim() || "",
    contact_name: customer.contact_name?.trim() || "",
    email: customer.email?.trim() || "",
    phone: customer.phone?.trim() || "",
    invoice_address: invoiceAddress,
    seller_name: seller?.full_name?.trim() || "",
    seller_email: seller?.email?.trim() || "",
    seller_phone: seller?.phone?.trim() || "",
    supplier_name: org?.name?.trim() || "",
    supplier_org_number: org?.org_number?.trim() || "",
    product: body.lines.map((line) => line.name?.trim()).filter(Boolean).join(", "),
    price: total > 0 ? money(total) : "",
    one_time_amount: details.one_time_amount?.trim() || (oneTime.length ? money(oneTime.reduce((sum, line) => sum + Number(line.unit_price || 0) * Math.max(1, Number(line.quantity || 1)), 0)) : "Ikke aktuelt"),
    monthly_amount: details.monthly_amount?.trim() || (recurring.length ? money(recurring.reduce((sum, line) => sum + Number(line.unit_price || 0) * Math.max(1, Number(line.quantity || 1)), 0)) : "Ikke aktuelt"),
    agreement_period: period,
    start_date: firstStart,
    end_date: agreementEnd,
    payment_terms: details.payment_terms?.trim() || "",
    discount: details.discount?.trim() || "Ingen rabatt",
  };

  const requiredKeys = ["customer_name", "organization_number", "product", "price", "end_date"];
  const missing = requiredKeys.filter((key) => !values[key as keyof typeof values]);
  if (missing.length) {
    return NextResponse.json({
      error: "Mangler informasjon",
      missing: missing.map((key) => ({ key, label: FIELD_LABELS[key] })),
      values,
    }, { status: 422 });
  }

  const lines = body.lines.map((line) => ({
    name: line.name,
    description: line.description,
    quantity: Math.max(1, Number(line.quantity || 1)),
    unit_price: Number(line.unit_price || 0),
    line_total: Number(line.unit_price || 0) * Math.max(1, Number(line.quantity || 1)),
    billing_type: line.billing_type,
    agreement_start: line.agreement_start || null,
    agreement_end: line.agreement_end || null,
  }));
  const productLines = lines
    .map((line) => `${line.quantity} × ${line.name || "Produkt"} – ${money(line.line_total)}`)
    .join("\n");
  const placeholderValues: Record<string, string> = {
    "customer.name": values.customer_name,
    "customer.org_number": values.organization_number,
    "customer.contact_name": values.contact_name,
    "customer.email": values.email,
    "customer.phone": values.phone,
    "customer.address": values.invoice_address,
    "contract.title": values.contract_title,
    "products.names": values.product,
    "products.lines": productLines,
    "price.total": values.price,
    "price.one_time": values.one_time_amount,
    "price.monthly": values.monthly_amount,
    "agreement.start_date": date(values.start_date),
    "agreement.end_date": date(values.end_date),
    "agreement.period": values.agreement_period,
    "agreement.payment_terms": values.payment_terms,
    "agreement.discount": values.discount,
    "seller.name": values.seller_name,
    "seller.email": values.seller_email,
    "seller.phone": values.seller_phone,
    "organization.name": values.supplier_name,
    "organization.org_number": values.supplier_org_number,
    "organization.email": org?.email?.trim() || "",
    "organization.phone": org?.phone?.trim() || "",
    "organization.address": [org?.address, [org?.postal_code, org?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  };
  const filled = fillContractPlaceholders(template.template_text, placeholderValues);
  const placeholderLabels = new Map(CONTRACT_PLACEHOLDERS.map((item) => [item.key, item.label]));
  if (filled.unknown.length || filled.missing.length) {
    return NextResponse.json({
      error: filled.unknown.length ? "Ukjente plassholdere i kontraktsmalen" : "Mangler informasjon",
      missing: filled.missing.map((key) => ({ key, label: placeholderLabels.get(key) ?? key })),
      unknown: filled.unknown.map((key) => ({ key, label: `{{${key}}}` })),
      values: placeholderValues,
    }, { status: 422 });
  }
  const snapshot = {
    template_id: template.id,
    template_name: template.name,
    values: placeholderValues,
    used_placeholders: filled.used,
    lines,
    generated_by: user.id,
    agreement_end: values.end_date,
  };

  let contract = filled.text;
  let ai = false;
  try {
    contract = await generateOpenAIText({
      instructions: `Du ferdigstiller en norsk B2B-kontrakt etter at alle eksplisitte {{plassholdere}} allerede er fylt deterministisk av Media Norge CRM. Bevar struktur, klausuler, nummerering, juridisk innhold og alle utfylte verdier. Du kan bare gjøre grammatisk nødvendige bøyninger og formatere produktlinjene lesbart. Ikke gjett, legg til fakta, endre priser eller fjern vilkår. Returner hele kontrakten som ren tekst uten markdown eller forklaring.`,
      input: `UTFYLT MAL:\n${filled.text}\n\nKONTROLLDATA:\n${JSON.stringify({ placeholders: placeholderValues, products: lines }, null, 2)}`,
      maxOutputTokens: 6000,
      model: process.env.OPENAI_CONTRACT_MODEL ?? "gpt-5.6-luna",
    });
    ai = Boolean(contract.trim());
  } catch {
    contract = filled.text;
  }

  return NextResponse.json({
    contract,
    ai,
    template: { id: template.id, name: template.name },
    used_fields: filled.used.map((key) => ({ key, label: placeholderLabels.get(key) ?? key, value: placeholderValues[key] })),
    generation_data: snapshot,
  });
}
