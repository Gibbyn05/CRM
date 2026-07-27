import { escapeHtml } from "./email";
import { formatCurrency, formatDate } from "./format";
import { BILLING_INTERVAL_SHORT } from "./constants";
import type { BillingInterval } from "./types";

// ============================================================================
//  Gjengivelse av kontrakt-/e-postmaler med dynamiske {{felt}}.
//
//  Malene lagres som ren tekst (linjeskift bevares). To varianter gjengis:
//   - renderTemplateHtml: selve kontrakt-/tilbudsdokumentet (vist på
//     /sign/[token] og lagret som document_body) – trygg, ferdig-escapet HTML.
//   - renderTemplateText: e-postens brødtekst – ren tekst som deretter
//     wrappes/escapes av contractEmailHtml() i src/lib/email.ts.
//
//  Ukjente {{plassholdere}} la stå urørt i output, slik at selgeren ser dem
//  tydelig i forhåndsvisningen og kan rette opp før utsending.
// ============================================================================

export interface TemplateLineItem {
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  override_price?: number | null;
  billing_interval: BillingInterval;
  binding_months?: number | null;
}

export interface TemplateContext {
  customer_name: string;
  org_number?: string | null;
  company_city?: string | null;
  advisor_name?: string | null;
  advisor_email?: string | null;
  // ISO-dato. Default: i dag.
  date?: string;
  valid_until?: string | null;
  items: TemplateLineItem[];
}

export const TEMPLATE_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "customer_name", label: "Kundens navn" },
  { key: "org_number", label: "Organisasjonsnummer" },
  { key: "company_city", label: "Kundens sted" },
  { key: "advisor_name", label: "Rådgivers/selgers navn" },
  { key: "advisor_email", label: "Rådgivers e-post" },
  { key: "date", label: "Dagens dato" },
  { key: "valid_until", label: "Tilbudet gyldig til" },
  { key: "products_table", label: "Produkt-/pristabell" },
  { key: "total_price", label: "Totalpris" },
];

export function lineEffectivePrice(item: Pick<TemplateLineItem, "unit_price" | "override_price">): number {
  return item.override_price ?? item.unit_price;
}

export function calculateTotal(items: TemplateLineItem[]): number {
  return items.reduce((sum, i) => sum + lineEffectivePrice(i) * i.quantity, 0);
}

function formatOrgNr(org: string | null | undefined): string {
  if (!org) return "";
  return org.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
}

function baseFields(ctx: TemplateContext): Record<string, string> {
  return {
    customer_name: ctx.customer_name || "",
    org_number: formatOrgNr(ctx.org_number),
    company_city: ctx.company_city || "",
    advisor_name: ctx.advisor_name || "",
    advisor_email: ctx.advisor_email || "",
    date: formatDate(ctx.date ?? new Date().toISOString()),
    valid_until: ctx.valid_until ? formatDate(ctx.valid_until) : "",
    total_price: formatCurrency(calculateTotal(ctx.items)),
  };
}

function substitute(body: string, fields: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, rawKey: string) => {
    const key = rawKey.toLowerCase();
    return Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : whole;
  });
}

function productsTableText(items: TemplateLineItem[]): string {
  if (items.length === 0) return "(ingen produkter lagt til)";
  const lines = items.map((i) => {
    const price = formatCurrency(lineEffectivePrice(i));
    const interval = BILLING_INTERVAL_SHORT[i.billing_interval];
    const binding = i.binding_months ? `, ${i.binding_months} mnd binding` : "";
    return `- ${i.name} (${i.quantity} stk): ${price}${interval}${binding}`;
  });
  lines.push(`Totalt: ${formatCurrency(calculateTotal(items))}`);
  return lines.join("\n");
}

function productsTableHtml(items: TemplateLineItem[]): string {
  if (items.length === 0) {
    return `<p style="color:#94a3b8;font-size:14px;">(ingen produkter lagt til)</p>`;
  }
  const rows = items
    .map((i) => {
      const price = formatCurrency(lineEffectivePrice(i));
      const discounted = i.override_price != null && i.override_price !== i.unit_price;
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(i.name)}${
          i.description ? `<div style="color:#94a3b8;font-size:12px;">${escapeHtml(i.description)}</div>` : ""
        }</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${i.quantity}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${escapeHtml(price)}${escapeHtml(BILLING_INTERVAL_SHORT[i.billing_interval])}${
          discounted ? ` <span style="color:#94a3b8;font-size:11px;text-decoration:line-through;">${escapeHtml(formatCurrency(i.unit_price))}</span>` : ""
        }</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b;">${
          i.binding_months ? `${i.binding_months} mnd` : "–"
        }</td>
      </tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
    <thead>
      <tr style="text-align:left;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.03em;">
        <th style="padding:6px 10px;">Produkt</th>
        <th style="padding:6px 10px;text-align:center;">Antall</th>
        <th style="padding:6px 10px;text-align:right;">Pris</th>
        <th style="padding:6px 10px;text-align:right;">Binding</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2"></td>
        <td style="padding:10px;text-align:right;font-weight:700;">${escapeHtml(formatCurrency(calculateTotal(items)))}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>`;
}

// Gjengir kontrakt-/tilbudsdokumentet som trygg, ferdig-escapet HTML (linjer
// bevares som <br />). Brukes til contracts.document_body og /sign/[token].
export function renderTemplateHtml(body: string, ctx: TemplateContext): string {
  const fields = baseFields(ctx);
  const escapedFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) escapedFields[k] = escapeHtml(v);
  // products_table settes til trygg, ferdig-generert HTML (ikke brukerinput)
  // og hentes derfor inn ETTER at resten av malteksten er escapet.
  escapedFields.products_table = productsTableHtml(ctx.items);

  const escapedBody = escapeHtml(body);
  const substituted = substitute(escapedBody, escapedFields);
  return substituted.replace(/\n/g, "<br />");
}

// Gjengir ren tekst (typisk e-postens brødtekst) – wrappes/escapes senere av
// contractEmailHtml()/sendEmail() i src/lib/email.ts.
export function renderTemplateText(body: string, ctx: TemplateContext): string {
  const fields = baseFields(ctx);
  const textFields = { ...fields, products_table: productsTableText(ctx.items) };
  return substitute(body, textFields);
}
