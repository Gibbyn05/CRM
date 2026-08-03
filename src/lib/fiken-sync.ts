// ============================================================================
//  Synkronisering av provisjonsrader (commissions) mot Fiken (KUN server-side).
//
//  For hver commission som har en Fiken-faktura (fiken_invoice_id) slår vi opp
//  fakturaens status i Fiken og oppdaterer commissions.status deretter:
//    betalt (settled) → 'betalt' + paid_at
//    ubetalt, forfalt → 'forfalt'
//    ubetalt, i frist  → 'fakturert'
//
//  Brukes både av «Synkroniser med Fiken»-knappen (regnskapsmenyen) og av
//  cron-jobben (Prompt 3). Fail-graceful: mangler Fiken-konfig, hopper vi over.
// ============================================================================

import { createAdminClient } from "./supabase/admin";
import { isFikenConfigured, listInvoices } from "./fiken";

type Admin = ReturnType<typeof createAdminClient>;

export interface SyncResult {
  skipped: boolean; // true hvis Fiken ikke er konfigurert
  checked: number; // antall commissions med faktura vi sjekket
  updated: number; // antall rader som endret status
}

interface CommissionRow {
  id: string;
  fiken_invoice_id: number;
  status: string;
  paid_at: string | null;
}

export async function syncCommissionsWithFiken(
  admin: Admin,
): Promise<SyncResult> {
  if (!isFikenConfigured()) {
    return { skipped: true, checked: 0, updated: 0 };
  }

  // Kun rader som faktisk er fakturert (har en Fiken-faktura) og ikke avskrevet.
  const { data } = await admin
    .from("commissions")
    .select("id, fiken_invoice_id, status, paid_at")
    .not("fiken_invoice_id", "is", null)
    .neq("status", "avskrevet");

  const commissions = (data ?? []) as CommissionRow[];
  if (commissions.length === 0) {
    return { skipped: false, checked: 0, updated: 0 };
  }

  // Hent oppgjorte og ubetalte fakturaer i to kall (Fiken skiller på ?settled).
  const [settled, unpaid] = await Promise.all([
    listInvoices({ settled: true }),
    listInvoices({ settled: false }),
  ]);
  const settledIds = new Set(settled.map((i) => i.invoiceId));
  const dueById = new Map<number, string | undefined>();
  for (const inv of [...settled, ...unpaid]) {
    dueById.set(inv.invoiceId, inv.dueDate);
  }

  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
  let updated = 0;

  for (const c of commissions) {
    let status = c.status;
    let paidAt = c.paid_at;

    if (settledIds.has(c.fiken_invoice_id)) {
      status = "betalt";
      paidAt = paidAt ?? new Date().toISOString();
    } else {
      const due = dueById.get(c.fiken_invoice_id);
      status = due && due < today ? "forfalt" : "fakturert";
    }

    if (status !== c.status || paidAt !== c.paid_at) {
      await admin
        .from("commissions")
        .update({ status, paid_at: paidAt })
        .eq("id", c.id);
      updated++;
    }
  }

  return { skipped: false, checked: commissions.length, updated };
}
