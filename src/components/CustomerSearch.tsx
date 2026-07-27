"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "@/lib/types";
import { formatOrgNumber } from "@/lib/format";
import NewCustomerButton from "./NewCustomerButton";
import Icon from "./Icon";

// Søkbar kundeliste. Søker på navn (ILIKE) og org.nr. RLS sørger for at
// selgere primært ser sine egne + ikke-tildelte kunder.
export default function CustomerSearch({
  initialQuery = "",
  canCreate = true,
}: {
  initialQuery?: string;
  canCreate?: boolean;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState(initialQuery);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      let q = supabase
        .from("customers")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(50);

      const trimmed = query.trim();
      if (trimmed) {
        if (/^\d+$/.test(trimmed)) {
          // Numerisk: søk på org.nr (prefiks).
          q = q.ilike("org_number", `${trimmed}%`);
        } else {
          q = q.ilike("name", `%${trimmed}%`);
        }
      }

      const { data } = await q;
      if (active) {
        setCustomers((data as Customer[]) ?? []);
        setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, supabase]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk navn eller org.nr …"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        {canCreate && <NewCustomerButton />}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">Navn</th>
              <th className="hidden px-4 py-3 sm:table-cell">Org.nr</th>
              <th className="hidden px-4 py-3 md:table-cell">Kontakt</th>
              <th className="hidden px-4 py-3 md:table-cell">Sted</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/customers/${c.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="hidden px-4 py-3 tabular-nums text-slate-600 sm:table-cell">
                  {formatOrgNumber(c.org_number)}
                </td>
                <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                  {c.contact_name ?? "–"}
                </td>
                <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                  {c.city ?? "–"}
                </td>
              </tr>
            ))}
            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Ingen kunder funnet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
