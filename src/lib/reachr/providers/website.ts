import { normalizeUrl, type ReachrCompany } from "@/lib/reachr";
import type { ReachrProvider, ReachrProviderResult } from "./types";

const CONTACT_PATHS = ["", "/kontakt", "/kontakt-oss", "/om-oss"];
const MAX_BYTES = 180_000;

export const websiteProvider: ReachrProvider = {
  name: "website",
  label: "Egen nettside",
  isConfigured() {
    return true;
  },
  async enrichByOrgNumber(_orgNumber: string, currentCompany?: ReachrCompany | null): Promise<ReachrProviderResult> {
    const website = normalizeUrl(currentCompany?.website);
    if (!website) {
      return {
        source: source("not_configured", [], "Fant ingen registrert nettside i Brreg."),
      };
    }

    try {
      const pages = await fetchWebsitePages(website);
      const combined = pages.map((page) => page.text).join("\n");
      const emails = extractEmails(combined);
      const phones = extractPhones(combined, currentCompany?.org_number);
      const description = extractDescription(pages[0]?.html ?? "");
      const enrichment: Partial<ReachrCompany> = {
        website,
        email: currentCompany?.email ?? emails[0] ?? null,
        phone: currentCompany?.phone ?? phones[0] ?? null,
        purpose: currentCompany?.purpose ?? description ?? null,
      };
      const fields = [
        "nettside",
        emails.length > 0 ? "e-post" : null,
        phones.length > 0 ? "telefon" : null,
        description ? "beskrivelse" : null,
      ].filter((field): field is string => Boolean(field));

      return {
        company: enrichment,
        source: source(
          "active",
          fields,
          fields.length
            ? undefined
            : "Nettsiden ble lest, men ingen tydelig telefon, e-post eller beskrivelse ble funnet.",
        ),
      };
    } catch (error) {
      return {
        source: source(
          "error",
          ["nettside"],
          error instanceof Error ? error.message : "Kunne ikke lese bedriftens nettside.",
        ),
      };
    }
  },
};

async function fetchWebsitePages(baseUrl: string): Promise<Array<{ html: string; text: string }>> {
  const origin = new URL(baseUrl).origin;
  const candidates = unique([
    baseUrl,
    ...CONTACT_PATHS.map((path) => `${origin}${path}`),
  ]);
  const pages: Array<{ html: string; text: string }> = [];

  for (const url of candidates) {
    if (pages.length >= 3) break;
    const page = await fetchPage(url);
    if (page) pages.push(page);
  }

  return pages;
}

async function fetchPage(url: string): Promise<{ html: string; text: string } | null> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "ReachrCRM/1.0 company-data-enrichment",
    },
    signal: AbortSignal.timeout(4500),
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return null;
  const html = (await res.text()).slice(0, MAX_BYTES);
  return { html, text: htmlToText(html) };
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return unique(
    matches
      .map((email) => email.toLowerCase())
      .filter((email) => !email.endsWith(".png") && !email.endsWith(".jpg") && !email.endsWith(".jpeg")),
  );
}

function extractPhones(text: string, orgNumber?: string): string[] {
  const matches = text.match(/(?:\+47[\s.-]?)?(?:\d[\s.-]?){8}/g) ?? [];
  return unique(
    matches
      .map((phone) => phone.replace(/[^\d+]/g, ""))
      .map((phone) => (phone.startsWith("+47") ? phone : phone.length === 8 ? `+47${phone}` : phone))
      .filter((phone) => /^\+47\d{8}$/.test(phone))
      .filter((phone) => phone.replace("+47", "") !== orgNumber),
  );
}

function extractDescription(html: string): string | null {
  const meta =
    html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1];
  if (!meta) return null;
  return htmlDecode(meta).slice(0, 280);
}

function htmlDecode(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function source(
  status: "active" | "not_configured" | "error",
  fields: string[],
  message?: string,
) {
  return {
    provider: "website",
    label: "Egen nettside",
    enabled: status === "active",
    fields,
    status,
    message,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
