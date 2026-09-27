import { NextRequest, NextResponse } from "next/server";
import { sanitizeCustomerImportRow, type CustomerImportRow } from "@/lib/customer-import";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_IMPORT_ROWS = 2_000;
const INSERT_BATCH_SIZE = 200;

type ImportBody = { rows?: unknown };

function todayInOslo(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
}

async function getExistingOrgNumbers(
  supabase: ReturnType<typeof createClient>,
  orgNumbers: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let offset = 0; offset < orgNumbers.length; offset += 500) {
    const { data, error } = await supabase
      .from("customers")
      .select("org_number")
      .in("org_number", orgNumbers.slice(offset, offset + 500));
    if (error) throw error;
    data?.forEach((customer) => {
      if (customer.org_number) existing.add(customer.org_number);
    });
  }
  return existing;
}

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: "Kun ledere kan importere kundelister." }, { status: 403 });
  }

  const limited = await enforceRateLimit(req, {
    name: "customers:import",
    limit: 5,
    windowSeconds: 60,
    userId: user.id,
  });
  if (limited) return limited;

  let body: ImportBody;
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "Ugyldig importforespørsel." }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "Velg minst én gyldig kundelinje." }, { status: 400 });
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `Importer maksimalt ${MAX_IMPORT_ROWS.toLocaleString("nb-NO")} kunder om gangen.` },
      { status: 400 },
    );
  }

  const candidates: CustomerImportRow[] = [];
  const rejected: { row: number; message: string }[] = [];
  const seenOrgNumbers = new Set<string>();
  body.rows.forEach((input, index) => {
    const result = sanitizeCustomerImportRow(input);
    if (!result.row || result.error) {
      rejected.push({ row: index + 1, message: result.error ?? "Ugyldig kundedata." });
      return;
    }
    if (result.row.org_number && seenOrgNumbers.has(result.row.org_number)) {
      rejected.push({ row: index + 1, message: "Duplikat organisasjonsnummer i importen." });
      return;
    }
    if (result.row.org_number) seenOrgNumbers.add(result.row.org_number);
    candidates.push(result.row);
  });
  if (candidates.length === 0) {
    return NextResponse.json({ error: "Ingen gyldige kunder å importere.", rejected }, { status: 422 });
  }

  let existingOrgNumbers: Set<string>;
  try {
    existingOrgNumbers = await getExistingOrgNumbers(
      supabase,
      candidates.flatMap((row) => (row.org_number ? [row.org_number] : [])),
    );
  } catch {
    return NextResponse.json({ error: "Kunne ikke kontrollere eksisterende kunder." }, { status: 500 });
  }

  const rowsToInsert = candidates.filter(
    (row) => !row.org_number || !existingOrgNumbers.has(row.org_number),
  );
  const importedAt = todayInOslo();
  let created = 0;

  for (let offset = 0; offset < rowsToInsert.length; offset += INSERT_BATCH_SIZE) {
    const batch = rowsToInsert.slice(offset, offset + INSERT_BATCH_SIZE).map((row) => ({
      ...row,
      // En gammel kundeliste skal vises under «Kunder». En eksplisitt verdi fra
      // filen beholdes, ellers brukes importdatoen.
      customer_since: row.customer_since ?? importedAt,
      owner_id: user.id,
      created_by: user.id,
    }));
    const { error } = await supabase.from("customers").insert(batch);
    if (error) {
      return NextResponse.json(
        {
          error: "Noen kunder kunne ikke lagres. Kontroller filen og prøv på nytt.",
          created,
          skipped_existing: candidates.length - rowsToInsert.length,
          rejected,
        },
        { status: 500 },
      );
    }
    created += batch.length;
  }

  return NextResponse.json({
    created,
    skipped_existing: candidates.length - rowsToInsert.length,
    rejected,
  });
}
