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
  deal_id: string | null;
  fiken_invoice_id: number | null;
  status: string;
  paid_at: string | null;
}

export async function syncCommissionsWithFiken(
  admin: Admin,
): Promise<SyncResult> {
  if (!isFikenConfigured()) {
    return { skipped: true, checked: 0, updated: 0 };
  }

  // Alle rader som er fakturert (utkast eller ferdig) og ikke avskrevet.
  const { data } = await admin
    .from("commissions")
    .select("id, deal_id, fiken_invoice_id, status, paid_at")
    .in("status", ["fakturert", "forfalt", "betalt"])
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
  const all = [...settled, ...unpaid];
  const settledIds = new Set(settled.map((i) => i.invoiceId));
  const dueById = new Map<number, string | undefined>();
  // Kobler utkast-fakturaer til ferdig faktura via orderReference (= commission-id).
  const invoiceByOrderRef = new Map<string, number>();
  for (const inv of all) {
    dueById.set(inv.invoiceId, inv.dueDate);
    if (inv.orderReference) invoiceByOrderRef.set(inv.orderReference, inv.invoiceId);
  }

  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
  let updated = 0;

  for (const c of commissions) {
    // Mangler vi faktura-id (kun utkast så langt)? Prøv å matche på
    // orderReference. Leder-flyten bruker commission-id, selger-flyten (fra
    // salgssiden) kan bruke deal-id – prøv begge.
    let invoiceId = c.fiken_invoice_id;
    if (!invoiceId) {
      const matched =
        invoiceByOrderRef.get(c.id) ??
        (c.deal_id ? invoiceByOrderRef.get(c.deal_id) : undefined);
      if (matched) invoiceId = matched;
    }

    // Ingen ferdig faktura ennå – behold status som den er.
    if (!invoiceId) continue;

    let status = c.status;
    let paidAt = c.paid_at;

    if (settledIds.has(invoiceId)) {
      status = "betalt";
      paidAt = paidAt ?? new Date().toISOString();
    } else {
      const due = dueById.get(invoiceId);
      status = due && due < today ? "forfalt" : "fakturert";
    }

    if (
      status !== c.status ||
      paidAt !== c.paid_at ||
      invoiceId !== c.fiken_invoice_id
    ) {
      await admin
        .from("commissions")
        .update({ status, paid_at: paidAt, fiken_invoice_id: invoiceId })
        .eq("id", c.id);
      updated++;
    }
  }

  return { skipped: false, checked: commissions.length, updated };
}
