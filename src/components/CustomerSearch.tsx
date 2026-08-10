"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatOrgNumber, timeAgo } from "@/lib/format";
import NewCustomerButton from "./NewCustomerButton";
import Icon from "./Icon";

type CustomerSort = "created" | "name" | "last_activity" | "status" | "seller" | "city" | "org_number";

interface CustomerListRow {
  id: string;
  name: string;
  org_number: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status_id: string | null;
  status_name: string | null;
  status_color: string | null;
  owner_id: string | null;
  seller_name: string;
  customer_since: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  total_count: number;
}

// Søkbar kundeliste. Søker på navn (ILIKE) og org.nr. RLS sørger for at
// selgere primært ser sine egne + ikke-tildelte kunder.
export default function CustomerSearch({
  initialQuery = "",
  canCreate = true,
  isManager = false,
}: {
  initialQuery?: string;
  canCreate?: boolean;
  isManager?: boolean;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<"kunder" | "potensielle">("kunder");
  const [sort, setSort] = useState<CustomerSort>("last_activity");
  const [ascending, setAscending] = useState(false);
  const [customers, setCustomers] = useState<CustomerListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 50;

  // Bygger spørringen for et gitt vindu (paginering via range). Henter kun de
  // kolonnene lista viser – ikke select("*") – for raskere last.
  const buildQuery = useCallback(
    (from: number) => {
      return supabase.rpc("get_customers_sorted", {
        p_query: query.trim(),
        p_kind: tab,
        p_sort: sort,
        p_ascending: ascending,
        p_offset: from,
        p_limit: PAGE_SIZE,
      });
    },
    [query, sort, ascending, tab, supabase],
  );

  // Første side (debounced) når søk/sortering/fane endres.
  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      const { data } = await buildQuery(0);
      if (active) {
        const rows = (data as CustomerListRow[]) ?? [];
        setCustomers(rows);
        setHasMore(rows.length === PAGE_SIZE);
        setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [buildQuery]);

  async function loadMore() {
    setLoadingMore(true);
    const from = customers.length;
    const { data } = await buildQuery(from);
    const rows = (data as CustomerListRow[]) ?? [];
    setCustomers((c) => [...c, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-white p-1 shadow-card ring-1 ring-slate-200/70 sm:w-fit">
        {([
          { key: "kunder", label: "Kunder" },
          { key: "potensielle", label: "Potensielle kunder" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "bg-brand-50 text-brand-700"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-md">
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
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          title="Sortering"
        >
          <option value="last_activity">Siste aktivitet</option>
          <option value="created">Dato opprettet</option>
          <option value="name">Navn</option>
          <option value="status">Status</option>
          {isManager && <option value="seller">Selger</option>}
          <option value="city">Sted</option>
          <option value="org_number">Organisasjonsnummer</option>
        </select>
        <button
          type="button"
          onClick={() => setAscending((value) => !value)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-[#bda98b] hover:bg-[#fbf7ed]"
          aria-label={ascending ? "Sorter synkende" : "Sorter stigende"}
          title="Bytt sorteringsretning"
        >
          <span aria-hidden="true" className="text-base">{ascending ? "↑" : "↓"}</span>
          {ascending ? "Stigende" : "Synkende"}
        </button>
        {canCreate && <NewCustomerButton />}
      </div>

      <div className="card overflow-hidden">
        <div className="divide-y divide-[#d8c9b0]/70 sm:hidden">
          {customers.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="block p-4 active:bg-[#fbf7ed]">
              <p className="font-display text-2xl font-bold leading-tight text-[#2b2118]">{c.name}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <MobileFact label="Org.nr" value={formatOrgNumber(c.org_number)} />
                <MobileFact label="Sted" value={c.city ?? "–"} />
                <MobileFact label="Kontakt" value={c.contact_name ?? "–"} />
                <MobileFact label="Telefon" value={c.phone ?? "–"} />
                <MobileFact label="Status" value={c.status_name ?? "Ingen status"} />
                <MobileFact label="Siste aktivitet" value={timeAgo(c.last_activity_at)} />
                {isManager && <MobileFact label="Selger" value={c.seller_name} />}
              </div>
            </Link>
          ))}
          {!loading && customers.length === 0 && (
            <p className="px-4 py-6 text-center text-slate-500">Ingen kunder funnet.</p>
          )}
        </div>
        <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead className="label-eyebrow border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3">Navn</th>
              <th className="hidden px-4 py-3 sm:table-cell">Org.nr</th>
              <th className="hidden px-4 py-3 md:table-cell">Kontakt</th>
              <th className="hidden px-4 py-3 md:table-cell">Sted</th>
              <th className="hidden px-4 py-3 lg:table-cell">Status</th>
              {isManager && <th className="hidden px-4 py-3 lg:table-cell">Selger</th>}
              <th className="px-4 py-3 text-right">Siste aktivitet</th>
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
                <td className="hidden px-4 py-3 lg:table-cell">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#d8c9b0] bg-[#fbf7ed] px-2.5 py-1 text-xs font-bold text-[#5f5549]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.status_color ?? "#bda98b" }} />
                    {c.status_name ?? "Ingen status"}
                  </span>
                </td>
                {isManager && (
                  <td className="hidden px-4 py-3 font-medium text-slate-700 lg:table-cell">{c.seller_name}</td>
                )}
                <td className="px-4 py-3 text-right text-xs font-medium text-slate-600">{timeAgo(c.last_activity_at)}</td>
              </tr>
            ))}
            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={isManager ? 7 : 6} className="px-4 py-6 text-center text-slate-500">
                  Ingen kunder funnet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingMore ? "Laster …" : "Last flere"}
          </button>
        </div>
      )}
    </div>
  );
}

function MobileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#d8c9b0] bg-[#fbf7ed] p-2.5">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8b7357]">{label}</p>
      <p className="mt-1 truncate font-semibold text-[#2b2118]">{value}</p>
    </div>
  );
}
