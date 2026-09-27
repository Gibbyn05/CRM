import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ExportCustomer = {
  id: string;
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

type VisibleCustomer = { id: string };

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

// Eksporten starter med nøyaktig samme RPC som Kundesiden bruker. Det gjør at
// gamle råposter som ikke vises under «Kunder» eller «Potensielle kunder»,
// heller ikke kan havne i CSV-filen.
async function getVisibleCustomerIds(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const ids = new Set<string>();
  const pageSize = 100;
  for (const kind of ["kunder", "potensielle"] as const) {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.rpc("get_customers_sorted", {
        p_query: "",
        p_kind: kind,
        p_sort: "name",
        p_ascending: true,
        p_offset: offset,
        p_limit: pageSize,
      });
      if (error) throw error;
      const page = (data ?? []) as VisibleCustomer[];
      page.forEach((customer) => ids.add(customer.id));
      if (page.length < pageSize) break;
    }
  }
  return [...ids];
}

async function getExportCustomers(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
): Promise<ExportCustomer[]> {
  const customers: ExportCustomer[] = [];
  for (let offset = 0; offset < ids.length; offset += 500) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, org_number, contact_name, email, phone, address, postal_code, city, customer_since, created_at")
      .in("id", ids.slice(offset, offset + 500));
    if (error) throw error;
    customers.push(...((data ?? []) as ExportCustomer[]));
  }
  return customers.sort((first, second) => first.name.localeCompare(second.name, "nb-NO"));
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
    const visibleIds = await getVisibleCustomerIds(supabase);
    customers = await getExportCustomers(supabase, visibleIds);
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
