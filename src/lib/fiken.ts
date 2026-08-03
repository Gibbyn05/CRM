// ============================================================================
//  Fiken API v2-klient (KUN server-side – aldri importer i klientkomponenter).
//
//  Autentisering: Authorization: Bearer <FIKEN_API_TOKEN>. Selskapet velges med
//  FIKEN_COMPANY_SLUG. Begge legges som miljøvariabler i Vercel (aldri
//  NEXT_PUBLIC – tokenet gir full tilgang til regnskapet).
//
//  Fail-graceful: mangler token/slug, returnerer list-funksjonene tomt og
//  logger en advarsel (samme mønster som transkript-koden når OPENAI_API_KEY
//  mangler). Da bygger og kjører appen fint før Fiken er koblet på.
//
//  Beløp fra Fiken er i øre (heltall). Bruk oreToNok() ved visning.
//  Docs: https://api.fiken.no/api/v2/docs/
// ============================================================================

const BASE_URL = "https://api.fiken.no/api/v2";
const PAGE_SIZE = 100; // Fikens maks
const MAX_PAGES = 50; // sikkerhetstak mot uendelig paginering

// ─────────────────────────── Typer (delmengde) ───────────────────────────
export interface FikenContact {
  contactId: number;
  name: string;
  email?: string | null;
  organizationNumber?: string | null;
  phoneNumber?: string | null;
  customer?: boolean;
  inactive?: boolean;
  [key: string]: unknown;
}

export interface FikenInvoice {
  invoiceId: number;
  invoiceNumber?: number;
  issueDate?: string; // yyyy-mm-dd
  dueDate?: string; // yyyy-mm-dd
  net?: number; // øre
  vat?: number; // øre
  gross?: number; // øre
  currency?: string;
  kid?: string;
  orderReference?: string;
  customer?: FikenContact;
  [key: string]: unknown;
}

export interface FikenSale {
  saleId: number;
  date?: string; // yyyy-mm-dd
  saleNumber?: string;
  netPrice?: number; // øre
  vat?: number; // øre
  paid?: boolean; // salg: betalt (true) eller ikke
  settled?: boolean;
  [key: string]: unknown;
}

// ─────────────────────────── Hjelpere ───────────────────────────
export function isFikenConfigured(): boolean {
  return Boolean(process.env.FIKEN_API_TOKEN && process.env.FIKEN_COMPANY_SLUG);
}

/** Øre (heltall fra Fiken) → kroner (number). */
export function oreToNok(ore: number | undefined | null): number {
  return typeof ore === "number" ? ore / 100 : 0;
}

function requireConfig(): { token: string; slug: string } | null {
  const token = process.env.FIKEN_API_TOKEN;
  const slug = process.env.FIKEN_COMPANY_SLUG;
  if (!token || !slug) {
    console.warn(
      "[fiken] FIKEN_API_TOKEN/FIKEN_COMPANY_SLUG mangler – hopper over Fiken-kall.",
    );
    return null;
  }
  return { token, slug };
}

type QueryValue = string | number | boolean | undefined;

async function fikenFetch(
  path: string,
  params: Record<string, QueryValue>,
  token: string,
): Promise<Response> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Fiken ${res.status} ${res.statusText} for ${path}: ${body.slice(0, 300)}`,
    );
  }
  return res;
}

/** Henter alle sider (paginert) og slår dem sammen til én liste. */
async function fikenGetAll<T>(
  path: string,
  params: Record<string, QueryValue>,
  token: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fikenFetch(
      path,
      { ...params, page, pageSize: PAGE_SIZE },
      token,
    );
    const batch = (await res.json()) as T[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break; // siste side
  }
  return out;
}

// ─────────────────────────── Offentlige API-kall ───────────────────────────

/**
 * Fakturaer for selskapet. settled=false gir kun ubetalte, settled=true kun
 * fullt oppgjorte; utelatt gir alle.
 */
export async function listInvoices(
  opts: { settled?: boolean } = {},
): Promise<FikenInvoice[]> {
  const cfg = requireConfig();
  if (!cfg) return [];
  return fikenGetAll<FikenInvoice>(
    `/companies/${cfg.slug}/invoices`,
    { settled: opts.settled },
    cfg.token,
  );
}

/** Én faktura, eller null hvis Fiken ikke er konfigurert. */
export async function getInvoice(
  invoiceId: number,
): Promise<FikenInvoice | null> {
  const cfg = requireConfig();
  if (!cfg) return null;
  const res = await fikenFetch(
    `/companies/${cfg.slug}/invoices/${invoiceId}`,
    {},
    cfg.token,
  );
  return (await res.json()) as FikenInvoice;
}

/** Salg for selskapet (paid-flagget forteller om det er betalt). */
export async function listSales(
  opts: { settled?: boolean } = {},
): Promise<FikenSale[]> {
  const cfg = requireConfig();
  if (!cfg) return [];
  return fikenGetAll<FikenSale>(
    `/companies/${cfg.slug}/sales`,
    { settled: opts.settled },
    cfg.token,
  );
}

/** Kontakter/kunder i Fiken (for matching mot CRM-kunder på org.nr). */
export async function listContacts(): Promise<FikenContact[]> {
  const cfg = requireConfig();
  if (!cfg) return [];
  return fikenGetAll<FikenContact>(
    `/companies/${cfg.slug}/contacts`,
    {},
    cfg.token,
  );
}

// Fiken svarer på POST med en Location-header til den nye ressursen; siste
// sti-ledd er id-en (contactId / draft-uuid).
function idFromLocation(res: Response): string | null {
  const loc = res.headers.get("location");
  if (!loc) return null;
  const parts = loc.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

/** Finn en Fiken-kontakt på organisasjonsnummer (9 sifre). */
export async function findContactByOrgNumber(
  orgNumber: string,
): Promise<FikenContact | null> {
  const digits = orgNumber.replace(/\D/g, "");
  if (digits.length !== 9) return null;
  const contacts = await listContacts();
  return (
    contacts.find(
      (c) => (c.organizationNumber ?? "").replace(/\D/g, "") === digits,
    ) ?? null
  );
}

/** Opprett en ny kunde-kontakt i Fiken. Returnerer contactId. */
export async function createContact(input: {
  name: string;
  organizationNumber?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
}): Promise<number | null> {
  const cfg = requireConfig();
  if (!cfg) return null;
  const body: Record<string, unknown> = { name: input.name, customer: true };
  if (input.organizationNumber) {
    const d = input.organizationNumber.replace(/\D/g, "");
    if (d.length === 9) body.organizationNumber = d;
  }
  if (input.email) body.email = input.email;
  if (input.phoneNumber) body.phoneNumber = input.phoneNumber;

  const res = await fikenFetch2(
    `/companies/${cfg.slug}/contacts`,
    "POST",
    body,
    cfg.token,
  );
  const id = idFromLocation(res);
  return id ? Number(id) : null;
}

export interface DraftLine {
  productName: string;
  unitPriceOre: number; // nettopris pr. enhet i øre
  quantity: number;
  vatType: string; // f.eks. "HIGH" (25 %)
  incomeAccount: string; // f.eks. "3000"
}

/**
 * Oppretter et faktura-UTKAST (ikke en ferdig faktura). Lederen godkjenner og
 * sender selv i Fiken. Returnerer draft-uuid (fra Location-headeren).
 */
export async function createInvoiceDraft(input: {
  customerId: number;
  daysUntilDueDate: number;
  orderReference?: string;
  lines: DraftLine[];
}): Promise<string | null> {
  const cfg = requireConfig();
  if (!cfg) return null;
  const body = {
    type: "invoice",
    customerId: input.customerId,
    daysUntilDueDate: input.daysUntilDueDate,
    ...(input.orderReference ? { orderReference: input.orderReference } : {}),
    lines: input.lines.map((l) => {
      const net = Math.round(l.unitPriceOre * l.quantity);
      const vat = l.vatType === "HIGH" ? Math.round(net * 0.25) : 0;
      return {
        productName: l.productName,
        unitPrice: l.unitPriceOre,
        quantity: l.quantity,
        vatType: l.vatType,
        incomeAccount: l.incomeAccount,
        net,
        vat,
        gross: net + vat,
      };
    }),
  };
  const res = await fikenFetch2(
    `/companies/${cfg.slug}/invoices/drafts`,
    "POST",
    body,
    cfg.token,
  );
  return idFromLocation(res);
}

// Skrive-variant av fikenFetch (POST med JSON-body).
async function fikenFetch2(
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  token: string,
): Promise<Response> {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Fiken ${res.status} ${res.statusText} for ${path}: ${detail.slice(0, 300)}`,
    );
  }
  return res;
}
