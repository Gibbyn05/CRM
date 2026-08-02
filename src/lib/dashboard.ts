import { format } from "date-fns";
import { nb } from "date-fns/locale";
import type { Period } from "./periods";
import type { CallDirection, CallStatus } from "./types";

// Periode -> hvilken tidsoppløsning grafen bruker (date_trunc i SQL).
export const PERIOD_TRUNC: Record<Period, string> = {
  dag: "hour",
  uke: "day",
  maned: "day",
  kvartal: "week",
  ar: "month",
};

// Aggregerte nøkkeltall for en selger/team i et tidsrom (get_agent_stats).
export interface AgentStats {
  calls_count: number;
  meetings_confirmed: number;
  sales_count: number;
  rejections_count: number;
  sales_amount: number;
}

export interface CallBucket {
  bucket: string;
  calls: number;
}

// Kort akse-etikett for én tidsbøtte, tilpasset valgt periode.
export function bucketLabel(iso: string, period: Period): string {
  const d = new Date(iso);
  switch (period) {
    case "dag":
      return format(d, "HH");
    case "uke":
      return format(d, "EEEEEE", { locale: nb }); // ma, ti, on …
    case "maned":
      return format(d, "d");
    case "kvartal":
      return "u" + format(d, "II"); // ISO-ukenummer
    case "ar":
      return format(d, "LLL", { locale: nb }); // jan, feb …
  }
}

export const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  ringing: "Ringer",
  answered: "Besvart",
  ended: "Fullført",
  missed: "Ubesvart",
};

export const CALL_STATUS_STYLES: Record<CallStatus, string> = {
  ringing: "bg-[#fff2cf] text-[#7a4f00]",
  answered: "bg-[#eafff5] text-[#008f52]",
  ended: "bg-[#171717] text-[#09fe94]",
  missed: "bg-[#fff0ea] text-[#b83208]",
};

export const CALL_DIRECTION_LABELS: Record<CallDirection, string> = {
  outbound: "Utgående",
  inbound: "Innkommende",
};
