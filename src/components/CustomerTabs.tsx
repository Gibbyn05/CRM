"use client";

import { useState } from "react";
import type { Contract, Customer, Deal, Note } from "@/lib/types";
import Icon, { type IconName } from "./Icon";
import LiveTranscript from "./LiveTranscript";
import NotesLog from "./NotesLog";
import CaseChat from "./CaseChat";
import DealsPanel from "./DealsPanel";
import ContractsPanel from "./ContractsPanel";

type TabKey = "aktivitet" | "salg" | "diskusjon";

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "aktivitet", label: "Aktivitet", icon: "dagsavis" },
  { key: "salg", label: "Salg", icon: "pipeline" },
  { key: "diskusjon", label: "Diskusjon", icon: "chat" },
];

// Fanebasert høyrekolonne på kundekortet. Sekundært innhold (aktivitetslogg,
// salg, intern diskusjon) fordeles på faner slik at kortet blir ryddig.
export default function CustomerTabs({
  customer,
  notes,
  deals,
  contracts,
  nameMap,
}: {
  customer: Customer;
  notes: Note[];
  deals: Deal[];
  contracts: Contract[];
  nameMap: Record<string, string>;
}) {
  const [tab, setTab] = useState<TabKey>("aktivitet");

  return (
    <div className="space-y-4">
      {/* Fanelinje */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card ring-1 ring-slate-200/70 thin-scroll">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <Icon
                name={t.icon}
                size={16}
                className={active ? "text-brand-600" : "text-slate-400"}
              />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Faneinnhold */}
      {tab === "aktivitet" && (
        <div className="space-y-4">
          <LiveTranscript customerId={customer.id} />
          <NotesLog
            customerId={customer.id}
            initialNotes={notes}
            nameMap={nameMap}
          />
        </div>
      )}

      {tab === "salg" && (
        <div className="space-y-4">
          <DealsPanel customerId={customer.id} initialDeals={deals} />
          <ContractsPanel customer={customer} initialContracts={contracts} />
        </div>
      )}

      {tab === "diskusjon" && (
        <CaseChat customerId={customer.id} nameMap={nameMap} />
      )}
    </div>
  );
}
