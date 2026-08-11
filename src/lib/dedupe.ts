type CustomerIdentity = { id: string; org_number?: string | null };
type DealIdentity = {
  id: string;
  customer_id: string;
  title: string;
  amount: number | null;
  stage: string;
};
type ContractIdentity = {
  id: string;
  customer_id: string;
  deal_id: string | null;
  channel: string;
  recipient: string;
  status: string;
};

export function dedupeCustomers<T extends CustomerIdentity>(rows: T[], preferredId?: string | null): T[] {
  const seen = new Set<string>();
  const ordered = preferredId
    ? [...rows].sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId))
    : rows;
  return ordered.filter((row) => {
    const orgNumber = row.org_number?.replace(/\D/g, "");
    const key = orgNumber || `id:${row.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Oversikter skal ikke vise samme logiske avtale flere ganger. Rekkefølgen
// bestemmer hvilken rad som beholdes, og spørringene leverer nyeste først.
export function dedupeDeals<T extends DealIdentity>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [
      row.customer_id,
      row.title.trim().toLocaleLowerCase("nb-NO"),
      Number(row.amount ?? 0).toFixed(2),
      row.stage,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dedupeContracts<T extends ContractIdentity>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [
      row.customer_id,
      row.deal_id ?? "no-deal",
      row.channel,
      row.recipient.trim().toLocaleLowerCase("nb-NO"),
      row.status,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
