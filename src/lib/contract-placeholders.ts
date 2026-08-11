export interface ContractPlaceholder {
  key: string;
  label: string;
  group: "Kunde" | "Avtale" | "Selger" | "Organisasjon";
  example: string;
}

export const CONTRACT_PLACEHOLDERS: ContractPlaceholder[] = [
  { key: "customer.name", label: "Kundens bedriftsnavn", group: "Kunde", example: "Eksempel AS" },
  { key: "customer.org_number", label: "Kundens org.nr", group: "Kunde", example: "123 456 789" },
  { key: "customer.contact_name", label: "Kontaktperson", group: "Kunde", example: "Ola Nordmann" },
  { key: "customer.email", label: "Kundens e-post", group: "Kunde", example: "ola@eksempel.no" },
  { key: "customer.phone", label: "Kundens telefon", group: "Kunde", example: "+47 900 00 000" },
  { key: "customer.address", label: "Kundens adresse", group: "Kunde", example: "Storgata 1, 0001 Oslo" },
  { key: "contract.title", label: "Avtalens tittel", group: "Avtale", example: "Avtale om ny nettside" },
  { key: "products.names", label: "Produkter og tjenester", group: "Avtale", example: "Ny nettside, drift" },
  { key: "products.lines", label: "Produktlinjer med pris", group: "Avtale", example: "1 × Ny nettside – 25 000 kr" },
  { key: "price.total", label: "Totalpris", group: "Avtale", example: "25 000 kr" },
  { key: "price.one_time", label: "Engangsbeløp", group: "Avtale", example: "25 000 kr" },
  { key: "price.monthly", label: "Månedlig kostnad", group: "Avtale", example: "990 kr/mnd" },
  { key: "agreement.start_date", label: "Oppstartsdato", group: "Avtale", example: "01.09.2026" },
  { key: "agreement.end_date", label: "Avtalens sluttdato", group: "Avtale", example: "31.08.2027" },
  { key: "agreement.period", label: "Avtaleperiode", group: "Avtale", example: "12 måneder" },
  { key: "agreement.payment_terms", label: "Betalingsbetingelser", group: "Avtale", example: "10 dager fra fakturadato" },
  { key: "agreement.discount", label: "Rabatt", group: "Avtale", example: "10 %" },
  { key: "seller.name", label: "Selgers navn", group: "Selger", example: "Kari Hansen" },
  { key: "seller.email", label: "Selgers e-post", group: "Selger", example: "kari@firma.no" },
  { key: "seller.phone", label: "Selgers telefon", group: "Selger", example: "+47 911 11 111" },
  { key: "organization.name", label: "Leverandørens navn", group: "Organisasjon", example: "Media Norge AS" },
  { key: "organization.org_number", label: "Leverandørens org.nr", group: "Organisasjon", example: "987 654 321" },
  { key: "organization.email", label: "Leverandørens e-post", group: "Organisasjon", example: "post@firma.no" },
  { key: "organization.phone", label: "Leverandørens telefon", group: "Organisasjon", example: "+47 22 00 00 00" },
  { key: "organization.address", label: "Leverandørens adresse", group: "Organisasjon", example: "Firmaveien 1, 0001 Oslo" },
];

const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function fillContractPlaceholders(
  template: string,
  values: Record<string, string>,
) {
  const used = new Set<string>();
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const known = new Set(CONTRACT_PLACEHOLDERS.map((item) => item.key));

  const text = template.replace(PLACEHOLDER_PATTERN, (original, rawKey: string) => {
    const key = rawKey.trim();
    if (!known.has(key)) {
      unknown.add(key);
      return original;
    }
    const value = values[key]?.trim();
    if (!value) {
      missing.add(key);
      return original;
    }
    used.add(key);
    return value;
  });

  return { text, used: [...used], missing: [...missing], unknown: [...unknown] };
}

export function placeholderToken(key: string) {
  return `{{${key}}}`;
}
