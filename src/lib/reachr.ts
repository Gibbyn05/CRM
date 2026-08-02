export type ReachrLeadStatus =
  | "Ikke kontaktet"
  | "Kontaktet"
  | "Ikke svar"
  | "Booket møte"
  | "Avslått"
  | "Kunde";

export interface ReachrAddress {
  address: string | null;
  postal_code: string | null;
  city: string | null;
  municipality: string | null;
}

export interface ReachrFinancials {
  year: string | null;
  revenue: number | null;
  operating_result: number | null;
  annual_result: number | null;
  equity: number | null;
  assets: number | null;
  debt: number | null;
}

export interface ReachrRole {
  role_code: string;
  role_name: string;
  name: string;
}

export interface ReachrCompany {
  org_number: string;
  name: string;
  organization_form_code: string | null;
  organization_form: string | null;
  industry_code: string | null;
  industry: string | null;
  employees: number | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  founded_at: string | null;
  vat_registered: boolean;
  business_register_registered: boolean;
  bankrupt: boolean;
  under_liquidation: boolean;
  purpose: string | null;
  address: ReachrAddress;
  financials?: ReachrFinancials | null;
  roles?: ReachrRole[];
}

export interface ReachrLead extends ReachrCompany {
  id: string;
  owner_id: string;
  customer_id: string | null;
  status: ReachrLeadStatus;
  source: string;
  notes: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export const REACHR_LEAD_STATUSES: ReachrLeadStatus[] = [
  "Ikke kontaktet",
  "Kontaktet",
  "Ikke svar",
  "Booket møte",
  "Avslått",
  "Kunde",
];

export const B2B_NACE_CODES = [
  "46",
  "62",
  "63",
  "69",
  "70",
  "71",
  "72",
  "73",
  "74",
  "77",
  "78",
  "80",
  "81",
  "82",
  "25",
  "28",
  "41",
  "43",
  "52",
];

export const INDUSTRY_FILTERS = [
  { label: "Alle bransjer", code: "" },
  { label: "B2B-bedrifter", code: "B2B" },
  { label: "Grossist og import", code: "46" },
  { label: "IT og programvare", code: "62" },
  { label: "Informasjonstjenester", code: "63" },
  { label: "Telekommunikasjon", code: "61" },
  { label: "Regnskap, revisjon og jus", code: "69" },
  { label: "Konsulent og ledelse", code: "70" },
  { label: "Arkitektur og ingeniør", code: "71" },
  { label: "Markedsføring og reklame", code: "73" },
  { label: "Design, foto og faglige tjenester", code: "74" },
  { label: "Bemanning og rekruttering", code: "78" },
  { label: "Kontor og forretningsstøtte", code: "82" },
  { label: "Bygg", code: "41" },
  { label: "Anlegg", code: "42" },
  { label: "Håndverk og installasjon", code: "43" },
  { label: "Eiendom", code: "68" },
  { label: "Transport", code: "49" },
  { label: "Lager og spedisjon", code: "52" },
  { label: "Sikkerhet og vakthold", code: "80" },
  { label: "Rengjøring og service", code: "81" },
  { label: "Produksjon av metallvarer", code: "25" },
  { label: "Maskiner og utstyr", code: "28" },
  { label: "Handel og butikk", code: "47" },
  { label: "Restaurant og servering", code: "56" },
  { label: "Helse", code: "86" },
  { label: "Utdanning og kurs", code: "85" },
];

export const NACE_KEYWORDS: Record<string, string> = {
  regnskap: "69",
  revisjon: "69",
  advokat: "69",
  juridisk: "70",
  konsulent: "70",
  rådgivning: "70",
  bygg: "41",
  entreprenør: "43",
  elektriker: "43",
  elektro: "43",
  rørlegger: "43",
  vvs: "43",
  snekker: "43",
  håndverk: "43",
  anlegg: "42",
  it: "62",
  software: "62",
  programvare: "62",
  teknologi: "62",
  utvikling: "62",
  web: "62",
  telekom: "61",
  bredbånd: "61",
  markedsføring: "73",
  reklame: "73",
  design: "74",
  foto: "74",
  bemanning: "78",
  rekruttering: "78",
  renhold: "81",
  rengjøring: "81",
  vakthold: "80",
  sikkerhet: "80",
  grossist: "46",
  import: "46",
  engros: "46",
  transport: "49",
  logistikk: "52",
  spedisjon: "52",
  lager: "52",
  eiendom: "68",
  restaurant: "56",
  frisør: "96",
  helse: "86",
  lege: "86",
  tannlege: "86",
  skole: "85",
  kurs: "85",
};

const ROLE_LABELS: Record<string, string> = {
  DAGL: "Daglig leder",
  LEDE: "Styreleder",
  MEDL: "Styremedlem",
  VARA: "Varamedlem",
  REV: "Revisor",
  REGN: "Regnskapsfører",
  BEST: "Bestyrer",
  PROK: "Prokura",
  PROKH: "Prokurist",
  SIGN: "Signatur",
};

const EXCLUDED_ORG_FORMS = new Set([
  "BRL",
  "BBL",
  "ESEK",
  "SAM",
  "TVAM",
  "BO",
  "KF",
  "FKF",
  "SF",
  "GFS",
  "PK",
  "KIRK",
  "ORGL",
]);

const EXCLUDED_NAME_PATTERNS = [
  /borettslag/i,
  /bofellesskap/i,
  /\bsameie\b/i,
  /eierseksjon/i,
  /huseierforening/i,
  /\bvelforening\b/i,
  /\bboliglag\b/i,
  /^\d+\s+[A-ZÆØÅ][a-zæøå]{2,}\s+(AS|DA|ANS)$/,
  /[A-ZÆØÅ][a-zæøå]+(veien|vegen|vei|gata|gaten|gate|plass|bakke|stien|sti)\s+\d+\s+(AS|DA)$/i,
];

export function guessNaceCode(query: string): string | null {
  const lower = query.toLowerCase().trim();
  if (!lower) return null;
  for (const [keyword, code] of Object.entries(NACE_KEYWORDS)) {
    if (keyword.length <= 3) {
      const re = new RegExp(`(?:^|\\s)${keyword}(?:\\s|$)`, "i");
      if (re.test(lower)) return code;
    } else if (lower.includes(keyword)) {
      return code;
    }
  }
  return null;
}

export function capitalizeWords(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (char) => char.toUpperCase());
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null) return "Ikke tilgjengelig";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value);
}

export function isRelevantBusiness(entity: BrregEntity): boolean {
  const formCode = entity.organisasjonsform?.kode ?? "";
  if (EXCLUDED_ORG_FORMS.has(formCode)) return false;
  const name = entity.navn ?? "";
  return !EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

export interface BrregEntity {
  organisasjonsnummer?: string;
  navn?: string;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  naeringskode1?: { kode?: string; beskrivelse?: string };
  naeringskode2?: { kode?: string; beskrivelse?: string };
  forretningsadresse?: {
    adresse?: string[];
    postnummer?: string;
    poststed?: string;
    kommune?: string;
  };
  postadresse?: {
    adresse?: string[];
    postnummer?: string;
    poststed?: string;
    kommune?: string;
  };
  antallAnsatte?: number;
  hjemmeside?: string;
  epostadresse?: string;
  telefon?: string;
  stiftelsesdato?: string;
  registrertIMvaregisteret?: boolean;
  registrertIForetaksregisteret?: boolean;
  konkurs?: boolean;
  underAvvikling?: boolean;
  vedtektsfestetFormaal?: string[];
  aktivitet?: string[];
}

export function normalizeBrregEntity(entity: BrregEntity): ReachrCompany {
  const address = entity.forretningsadresse ?? entity.postadresse;
  return {
    org_number: entity.organisasjonsnummer ?? "",
    name: capitalizeWords(entity.navn),
    organization_form_code: entity.organisasjonsform?.kode ?? null,
    organization_form: entity.organisasjonsform?.beskrivelse ?? null,
    industry_code: entity.naeringskode1?.kode ?? null,
    industry: entity.naeringskode1?.beskrivelse
      ? capitalizeWords(entity.naeringskode1.beskrivelse)
      : null,
    employees: entity.antallAnsatte ?? null,
    website: normalizeUrl(entity.hjemmeside),
    email: entity.epostadresse ?? null,
    phone: entity.telefon ?? null,
    founded_at: entity.stiftelsesdato ?? null,
    vat_registered: Boolean(entity.registrertIMvaregisteret),
    business_register_registered: Boolean(entity.registrertIForetaksregisteret),
    bankrupt: Boolean(entity.konkurs),
    under_liquidation: Boolean(entity.underAvvikling),
    purpose: entity.vedtektsfestetFormaal?.[0] ?? entity.aktivitet?.[0] ?? null,
    address: {
      address: (address?.adresse ?? []).filter(Boolean).join(", ") || null,
      postal_code: address?.postnummer ?? null,
      city: address?.poststed ? capitalizeWords(address.poststed) : null,
      municipality: address?.kommune ? capitalizeWords(address.kommune) : null,
    },
  };
}

export function normalizeRoles(payload: unknown): ReachrRole[] {
  const groups = getArray(payload, "rollegrupper");
  return groups.flatMap((group) =>
    getArray(group, "roller")
      .map((role) => {
        const type = getRecord(role, "type");
        const person = getRecord(role, "person");
        const navn = getRecord(person, "navn");
        const code = getString(type, "kode") ?? "";
        const name = [getString(navn, "fornavn"), getString(navn, "etternavn")]
          .filter(Boolean)
          .join(" ");
        return {
          role_code: code,
          role_name: getString(type, "beskrivelse") ?? ROLE_LABELS[code] ?? code,
          name: capitalizeWords(name),
        };
      })
      .filter((role) => role.name),
  );
}

export function normalizeFinancials(payload: unknown): ReachrFinancials | null {
  const rows = Array.isArray(payload) ? payload : [];
  if (rows.length === 0) return null;
  const latest = [...rows].sort((a, b) => {
    const ay = getString(getRecord(a, "regnskapsperiode"), "tilDato") ?? "";
    const by = getString(getRecord(b, "regnskapsperiode"), "tilDato") ?? "";
    return by.localeCompare(ay);
  })[0];
  const period = getRecord(latest, "regnskapsperiode");
  const result = getRecord(latest, "resultatregnskapResultat");
  const operating = getRecord(result, "driftsresultat");
  const income = getRecord(operating, "driftsinntekter");
  const balance = getRecord(latest, "egenkapitalGjeld");
  const equity = getRecord(balance, "egenkapital");
  const debt = getRecord(balance, "gjeld");
  const assets = getRecord(latest, "eiendeler");
  return {
    year: getString(period, "tilDato")?.slice(0, 4) ?? null,
    revenue: getNumber(income, "sumDriftsinntekter"),
    operating_result: getNumber(operating, "driftsresultat"),
    annual_result:
      getNumber(result, "aarsresultat") ??
      getNumber(result, "ordinaertResultatFoerSkattekostnad"),
    equity: getNumber(equity, "sumEgenkapital"),
    assets: getNumber(assets, "sumEiendeler"),
    debt: getNumber(debt, "sumGjeld"),
  };
}

export function leadRowToReachrLead(row: Record<string, unknown>): ReachrLead {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    customer_id: stringOrNull(row.customer_id),
    status: (row.status as ReachrLeadStatus) ?? "Ikke kontaktet",
    source: String(row.source ?? "Brreg"),
    notes: stringOrNull(row.notes),
    last_contacted_at: stringOrNull(row.last_contacted_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    org_number: String(row.org_number),
    name: String(row.name ?? ""),
    organization_form_code: stringOrNull(row.organization_form_code),
    organization_form: stringOrNull(row.organization_form),
    industry_code: stringOrNull(row.industry_code),
    industry: stringOrNull(row.industry),
    employees: numberOrNull(row.employees),
    website: stringOrNull(row.website),
    email: stringOrNull(row.email),
    phone: stringOrNull(row.phone),
    founded_at: stringOrNull(row.founded_at),
    vat_registered: Boolean(row.vat_registered),
    business_register_registered: Boolean(row.business_register_registered),
    bankrupt: Boolean(row.bankrupt),
    under_liquidation: Boolean(row.under_liquidation),
    purpose: stringOrNull(row.purpose),
    address: {
      address: stringOrNull(row.address),
      postal_code: stringOrNull(row.postal_code),
      city: stringOrNull(row.city),
      municipality: stringOrNull(row.municipality),
    },
    financials: {
      year: stringOrNull(row.financial_year),
      revenue: numberOrNull(row.revenue),
      operating_result: numberOrNull(row.operating_result),
      annual_result: numberOrNull(row.annual_result),
      equity: numberOrNull(row.equity),
      assets: numberOrNull(row.assets),
      debt: numberOrNull(row.debt),
    },
    roles: Array.isArray(row.roles) ? (row.roles as ReachrRole[]) : [],
  };
}

export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getRecord(source: unknown, key: string): Record<string, unknown> | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getArray(source: unknown, key: string): Record<string, unknown>[] {
  if (!source || typeof source !== "object") return [];
  const value = (source as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

function getString(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(source: unknown, key: string): number | null {
  if (!source || typeof source !== "object") return null;
  return numberOrNull((source as Record<string, unknown>)[key]);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}
