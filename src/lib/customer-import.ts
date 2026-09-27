import { isValidOrgNumber, normalizePhoneNumber } from "@/lib/format";

export const CUSTOMER_IMPORT_FIELDS = [
  { key: "name", label: "Navn", required: true },
  { key: "org_number", label: "Organisasjonsnummer", required: false },
  { key: "contact_name", label: "Kontaktperson", required: false },
  { key: "email", label: "E-post", required: false },
  { key: "phone", label: "Telefon", required: false },
  { key: "address", label: "Adresse", required: false },
  { key: "postal_code", label: "Postnummer", required: false },
  { key: "city", label: "Poststed", required: false },
  { key: "customer_since", label: "Kunde siden", required: false },
] as const;

export type CustomerImportField = (typeof CUSTOMER_IMPORT_FIELDS)[number]["key"];

export type CustomerImportMapping = Partial<Record<CustomerImportField, number>>;

export type CustomerImportRow = {
  name: string;
  org_number: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  customer_since: string | null;
};

export type CustomerImportIssue = {
  row: number;
  message: string;
};

export type CustomerImportPreview = {
  rows: CustomerImportRow[];
  issues: CustomerImportIssue[];
};

const HEADER_ALIASES: Record<CustomerImportField, string[]> = {
  name: ["navn", "kundenavn", "bedriftsnavn", "firmanavn", "firma", "kunde", "company", "companyname", "customername"],
  org_number: ["orgnr", "organisasjonsnummer", "organisasjonsnr", "orgnummer", "organizationnumber"],
  contact_name: ["kontakt", "kontaktperson", "kontaktpersonnavn", "contact", "contactname"],
  email: ["epost", "email", "epostadresse", "emailadresse"],
  phone: ["telefon", "telefonnummer", "tlf", "mobil", "mobilnummer", "phone", "phonenumber", "mobile"],
  address: ["adresse", "gateadresse", "address", "streetaddress"],
  postal_code: ["postnr", "postnummer", "postalcode", "postcode", "zip"],
  city: ["sted", "poststed", "by", "city", "town"],
  customer_since: ["kundesiden", "customersince", "customerdate", "kundedato"],
};

const MAX_FIELD_LENGTH = 500;

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function text(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, MAX_FIELD_LENGTH);
}

function nullable(value: string): string | null {
  return value || null;
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const norwegian = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const year = iso?.[1] ?? norwegian?.[3];
  const month = iso?.[2] ?? norwegian?.[2]?.padStart(2, "0");
  const day = iso?.[3] ?? norwegian?.[1]?.padStart(2, "0");
  if (!year || !month || !day) return null;
  const parsed = new Date(`${year}-${month}-${day}T12:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

function valueFor(
  row: readonly unknown[],
  mapping: CustomerImportMapping,
  field: CustomerImportField,
): string {
  const index = mapping[field];
  return index === undefined || index < 0 ? "" : text(row[index]);
}

export function suggestCustomerImportMapping(headers: readonly string[]): CustomerImportMapping {
  const normalizedHeaders = headers.map(normalizeHeader);
  return CUSTOMER_IMPORT_FIELDS.reduce<CustomerImportMapping>((mapping, field) => {
    const index = normalizedHeaders.findIndex((header) =>
      HEADER_ALIASES[field.key].includes(header),
    );
    if (index >= 0) mapping[field.key] = index;
    return mapping;
  }, {});
}

export function sanitizeCustomerImportRow(input: unknown): {
  row: CustomerImportRow | null;
  error: string | null;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { row: null, error: "Ugyldig kundedata." };
  }
  const value = input as Record<string, unknown>;
  const name = text(value.name);
  const orgNumber = text(value.org_number).replace(/\D/g, "");
  const email = text(value.email).toLowerCase();
  const phone = text(value.phone);
  const customerSince = text(value.customer_since);

  if (!name) return { row: null, error: "Navn mangler." };
  if (orgNumber && !isValidOrgNumber(orgNumber)) {
    return { row: null, error: "Organisasjonsnummeret er ikke gyldig." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { row: null, error: "E-postadressen er ikke gyldig." };
  }
  if (phone && !normalizePhoneNumber(phone)) {
    return { row: null, error: "Telefonnummeret er ikke gyldig." };
  }
  if (customerSince && !parseDate(customerSince)) {
    return { row: null, error: "Kunde siden må være en gyldig dato." };
  }

  return {
    row: {
      name,
      org_number: nullable(orgNumber),
      contact_name: nullable(text(value.contact_name)),
      email: nullable(email),
      phone: nullable(phone),
      address: nullable(text(value.address)),
      postal_code: nullable(text(value.postal_code)),
      city: nullable(text(value.city)),
      customer_since: customerSince ? parseDate(customerSince) : null,
    },
    error: null,
  };
}

export function buildCustomerImportPreview(
  sourceRows: readonly (readonly unknown[])[],
  mapping: CustomerImportMapping,
): CustomerImportPreview {
  const rows: CustomerImportRow[] = [];
  const issues: CustomerImportIssue[] = [];
  const orgNumbers = new Set<string>();

  sourceRows.forEach((sourceRow, sourceIndex) => {
    const raw = Object.fromEntries(
      CUSTOMER_IMPORT_FIELDS.map((field) => [
        field.key,
        valueFor(sourceRow, mapping, field.key),
      ]),
    );
    const result = sanitizeCustomerImportRow(raw);
    if (!result.row || result.error) {
      issues.push({ row: sourceIndex + 2, message: result.error ?? "Ugyldig kundedata." });
      return;
    }
    if (result.row.org_number && orgNumbers.has(result.row.org_number)) {
      issues.push({
        row: sourceIndex + 2,
        message: "Samme organisasjonsnummer forekommer flere ganger i filen.",
      });
      return;
    }
    if (result.row.org_number) orgNumbers.add(result.row.org_number);
    rows.push(result.row);
  });

  return { rows, issues };
}

function delimiterCount(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') {
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && line[index] === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function detectDelimiter(source: string): string {
  const firstLine = source.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "\t"];
  return candidates.reduce((best, delimiter) =>
    delimiterCount(firstLine, delimiter) > delimiterCount(firstLine, best)
      ? delimiter
      : best,
  );
}

// Leser CSV/TSV uten å splitte feil på semikolon, komma eller linjeskift inne
// i anførselstegn. Det er bevisst ingen Excel-parser på server eller klient.
export function parseDelimitedText(source: string, delimiter = detectDelimiter(source)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = source.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  rows.push(row);

  return rows.filter((values) => values.some((value) => value.trim() !== ""));
}

export function toImportedTable(source: string): { headers: string[]; rows: string[][] } {
  const values = parseDelimitedText(source);
  const [headerRow, ...rows] = values;
  const headers = (headerRow ?? []).map((value, index) =>
    text(value) || `Kolonne ${index + 1}`,
  );
  return { headers, rows };
}
