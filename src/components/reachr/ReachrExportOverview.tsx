"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";

export interface ExportedLead {
  id: string;
  org_number: string;
  name: string;
  owner_id: string;
  owner_name: string;
  customer_id: string | null;
  status: string;
  created_at: string;
}

// Oversikt for ledere over hvor mange prospekter som er hentet fra Reachr og
// eksportert (opprettet/koblet) som kunde i CRM-basen – totalt og pr. selger.
// Hver rad i reachr_leads representerer én eksport (customer_id settes alltid
// når en selger lagrer et lead, se /api/reachr/leads).
export default function ReachrExportOverview({ leads }: { leads: ExportedLead[] }) {
  const perSeller = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const lead of leads) {
      const entry = map.get(lead.owner_id) ?? { name: lead.owner_name, count: 0 };
      entry.count += 1;
      map.set(lead.owner_id, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [leads]);

  const customers = leads.filter((l) => l.status === "Kunde").length;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3">
        <Stat label="Totalt eksportert til CRM" value={leads.length} />
        <Stat label="Konvertert til kunde" value={customers} />
        <Stat label="Selgere som har eksportert" value={perSeller.length} />
      </section>

      <section className="rounded-[2rem] border border-[#d8c9b0] bg-[#fffaf0]/85 p-5">
        <p className="label-eyebrow mb-3">Pr. selger</p>
        {perSeller.length === 0 ? (
          <p className="text-sm text-[#6f5a43]">Ingen eksporter ennå.</p>
        ) : (
          <div className="space-y-2">
            {perSeller.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between rounded-2xl border border-[#e4d3b8] bg-[#f6ecd9] px-4 py-2.5"
              >
                <span className="text-sm font-bold text-[#2b2118]">{s.name}</span>
                <span className="text-sm font-black text-[#2b2118]">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[2rem] border border-[#d8c9b0] bg-[#fffaf0]/85 p-5">
        <p className="label-eyebrow mb-3">Nylige eksporter</p>
        {leads.length === 0 ? (
          <p className="text-sm text-[#6f5a43]">Ingen eksporter ennå.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#d8c9b0] text-xs font-black uppercase tracking-[0.14em] text-[#8b7357]">
                <tr>
                  <th className="py-2 pr-4">Firma</th>
                  <th className="py-2 pr-4">Selger</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Dato</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 30).map((l) => (
                  <tr key={l.id} className="border-b border-[#efe1c7]">
                    <td className="py-2.5 pr-4 font-semibold text-[#2b2118]">
                      {l.customer_id ? (
                        <Link href={`/customers/${l.customer_id}`} className="hover:underline">
                          {l.name}
                        </Link>
                      ) : (
                        l.name
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-[#6f5a43]">{l.owner_name}</td>
                    <td className="py-2.5 pr-4 text-[#6f5a43]">{l.status}</td>
                    <td className="py-2.5 pr-4 text-[#6f5a43]">{formatDate(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.75rem] border border-[#d8c9b0] bg-[#fffaf0] p-5 shadow-sm">
      <p className="label-eyebrow">{label}</p>
      <p className="mt-2 font-display text-4xl font-black text-[#2b2118]">{value}</p>
    </div>
  );
}
