"use client";

import { useState } from "react";
import type {
  Appointment,
  CallLog,
  Commission,
  Contract,
  Customer,
  CustomerFile,
  Deal,
  Note,
  Reminder,
} from "@/lib/types";
import Icon, { type IconName } from "./Icon";
import LiveTranscript from "./LiveTranscript";
import NotesLog from "./NotesLog";
import DealsPanel from "./DealsPanel";
import ContractsPanel from "./ContractsPanel";
import CustomerCustomInfo from "./CustomerCustomInfo";
import CustomerFiles from "./CustomerFiles";

type TabKey = "aktivitet" | "salg" | "info" | "filer" | "transkripsjon";

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "aktivitet", label: "Aktivitet", icon: "dagsavis" },
  { key: "salg", label: "Salg", icon: "pipeline" },
  { key: "info", label: "Egendefinert info", icon: "building" },
  { key: "filer", label: "Filer", icon: "box" },
  { key: "transkripsjon", label: "Transkripsjon", icon: "mic" },
];

// Fanebasert høyrekolonne på kundekortet. Sekundært innhold (aktivitetslogg,
// salg) fordeles på faner slik at kortet blir ryddig.
export default function CustomerTabs({
  customer,
  notes,
  deals: initialDeals,
  contracts,
  calls,
  appointments,
  reminders,
  commissions,
  files,
  nameMap,
}: {
  customer: Customer;
  notes: Note[];
  deals: Deal[];
  contracts: Contract[];
  calls: CallLog[];
  appointments: Appointment[];
  reminders: Reminder[];
  commissions: Commission[];
  files: CustomerFile[];
  nameMap: Record<string, string>;
}) {
  const [tab, setTab] = useState<TabKey>("aktivitet");
  // Delt salgs-state så et nytt salg overlever fanebytte OG dukker opp i loggen.
  const [deals, setDeals] = useState<Deal[]>(initialDeals);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white/80">
      {/* Fanelinje */}
      <div className="flex shrink-0 gap-7 overflow-x-auto border-b border-[#e7ddcd] bg-white px-6 pt-2 thin-scroll">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count =
            t.key === "salg"
              ? deals.length
              : t.key === "filer"
                ? files.length
                : 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={active ? "page" : undefined}
              className={`relative flex shrink-0 items-center gap-2 px-1 py-4 text-sm font-semibold transition ${
                active
                  ? "text-[#087a4b] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#00a965]"
                  : "text-[#756d64] hover:text-[#2b2118]"
              }`}
            >
              <Icon
                name={t.icon}
                size={16}
                className={active ? "text-brand-600" : "text-slate-400"}
              />
              {t.label}
              {count > 0 && (
                <span
                  className={`ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-2xs font-bold ${
                    active
                      ? "bg-brand-600 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Faneinnhold */}
      <div
        className={`min-h-0 flex-1 ${tab === "aktivitet" ? "overflow-hidden" : "overflow-y-auto p-4 sm:p-5"}`}
      >
        {tab === "aktivitet" && (
          <div className="h-full min-h-0 overflow-hidden">
            <NotesLog
              customerId={customer.id}
              initialNotes={notes}
              deals={deals}
              contracts={contracts}
              calls={calls}
              appointments={appointments}
              reminders={reminders}
              commissions={commissions}
              nameMap={nameMap}
            />
          </div>
        )}

        {tab === "salg" && (
          <div className="space-y-4">
            <DealsPanel
              customerId={customer.id}
              deals={deals}
              setDeals={setDeals}
            />
            <ContractsPanel customer={customer} initialContracts={contracts} />
          </div>
        )}

        {tab === "info" && (
          <CustomerCustomInfo
            customerId={customer.id}
            initialFields={customer.custom_info ?? []}
          />
        )}

        {tab === "filer" && (
          <CustomerFiles
            customerId={customer.id}
            initialFiles={files}
            nameMap={nameMap}
          />
        )}

        {tab === "transkripsjon" && (
          <LiveTranscript customerId={customer.id} />
        )}
      </div>
    </div>
  );
}
