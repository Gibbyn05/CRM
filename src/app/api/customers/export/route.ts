import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ExportCustomer = {
  name: string;
  org_number: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  customer_since: string | null;
  created_at: string;
};

function csvValue(value: string | null): string {
  let safe = value ?? "";
  // Hindrer at et kundefelt blir behandlet som en formel når filen åpnes i
  // Excel eller Google Sheets. Apostrofen vises ikke som del av cellen der.
  if (/^[=+@-]/.test(safe)) safe = `'${safe}`;
  return `"${safe.replace(/"/g, '""')}"`;
}

function fileDate(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" })
    .format(new Date())
    .replace(/-/g, "");
}

async function getAllCustomers(
  supabase: ReturnType<typeof createClient>,
): Promise<ExportCustomer[]> {
  const customers: ExportCustomer[] = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("customers")
      .select("name, org_number, contact_name, email, phone, address, postal_code, city, customer_since, created_at")
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as ExportCustomer[];
    customers.push(...page);
    if (page.length < pageSize) return customers;
  }
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (profile?.role !== "manager") {
    return NextResponse.json({ error: "Kun ledere kan eksportere kundelister." }, { status: 403 });
  }

  const limited = await enforceRateLimit(req, {
    name: "customers:export",
    limit: 10,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  let customers: ExportCustomer[];
  try {
    customers = await getAllCustomers(supabase);
  } catch {
    return NextResponse.json({ error: "Kunne ikke hente kundelisten." }, { status: 500 });
  }

  const header = [
    "Navn",
    "Organisasjonsnummer",
    "Kontaktperson",
    "E-post",
    "Telefon",
    "Adresse",
    "Postnummer",
    "Poststed",
    "Kunde siden",
    "Opprettet",
  ];
  const lines = [
    header.map(csvValue).join(";"),
    ...customers.map((customer) =>
      [
        customer.name,
        customer.org_number,
        customer.contact_name,
        customer.email,
        customer.phone,
        customer.address,
        customer.postal_code,
        customer.city,
        customer.customer_since?.slice(0, 10) ?? null,
        customer.created_at.slice(0, 10),
      ]
        .map(csvValue)
        .join(";"),
    ),
  ];

  return new NextResponse(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="media-norge-kunder-${fileDate()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
