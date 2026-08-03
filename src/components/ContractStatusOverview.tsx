"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Contract, ContractStatus } from "@/lib/types";
import { CONTRACT_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

export interface ContractWithNames extends Contract {
  customer_name: string;
  agent_name: string | null;
}

const STATUS_BADGE: Record<ContractStatus, string> = {
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
  sent: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  opened: "bg-amber-50 text-amber-700 ring-amber-200",
  signed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  declined: "bg-rose-50 text-rose-700 ring-rose-200",
};

const STATUSES: ContractStatus[] = [
  "draft",
  "sent",
  "opened",
  "signed",
  "declined",
];

// Ledernes status/oversikt over kontraktsignering: hvor mange som er
// sendt/åpnet/signert/avslått på tvers av alle selgere, med signeringsgrad
// og en filtrerbar liste over hver enkelt kontrakt.
export default function ContractStatusOverview({
  contracts,
}: {
  contracts: ContractWithNames[];
}) {
  const [filter, setFilter] = useState<ContractStatus | "alle">("alle");

  const counts = useMemo(() => {
    const map = new Map<ContractStatus, number>(STATUSES.map((s) => [s, 0]));
    for (const c of contracts) {
      map.set(c.status, (map.get(c.status) ?? 0) + 1);
    }
    return map;
  }, [contracts]);

  // Signeringsgrad blant kontrakter som faktisk er sendt ut (ekskl. kladd).
  const sentOrLater = contracts.filter((c) => c.status !== "draft").length;
  const signRate = sentOrLater === 0 ? null : Math.round(((counts.get("signed") ?? 0) / sentOrLater) * 100);

  const filtered = useMemo(
    () =>
      contracts.filter((c) => (filter === "alle" ? true : c.status === filter)),
    [contracts, filter],
  );

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Signeringsgrad"
          value={signRate === null ? "–" : `${signRate}%`}
        />
        {STATUSES.map((s) => (
          <Stat key={s} label={CONTRACT_STATUS_LABELS[s]} value={counts.get(s) ?? 0} />
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Filtrer:</span>
        <FilterButton
          active={filter === "alle"}
          onClick={() => setFilter("alle")}
          label={`Alle (${contracts.length})`}
        />
        {STATUSES.map((s) => (
          <FilterButton
            key={s}
            active={filter === s}
            onClick={() => setFilter(s)}
            label={`${CONTRACT_STATUS_LABELS[s]} (${counts.get(s) ?? 0})`}
          />
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="label-eyebrow border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3">Kunde</th>
              <th className="hidden px-4 py-3 sm:table-cell">Selger</th>
              <th className="hidden px-4 py-3 md:table-cell">Kanal</th>
              <th className="px-4 py-3">Status</th>
              <th className="hidden px-4 py-3 lg:table-cell">Sendt</th>
              <th className="hidden px-4 py-3 lg:table-cell">Signert</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/customers/${c.customer_id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {c.customer_name}
                  </Link>
                </td>
                <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                  {c.agent_name ?? "–"}
                </td>
                <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                  {c.channel === "email" ? "E-post" : "SMS"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_BADGE[c.status]}`}
                  >
                    {CONTRACT_STATUS_LABELS[c.status]}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">
                  {formatDateTime(c.sent_at)}
                </td>
                <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">
                  {formatDateTime(c.signed_at)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Ingen kontrakter her.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <p className="label-eyebrow">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-brand-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
