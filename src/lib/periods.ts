import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
} from "date-fns";

export type Period = "dag" | "uke" | "maned" | "kvartal" | "ar";

export const PERIOD_LABELS: Record<Period, string> = {
  dag: "Dag",
  uke: "Uke",
  maned: "Måned",
  kvartal: "Kvartal",
  ar: "År",
};

export const PERIODS: Period[] = ["dag", "uke", "maned", "kvartal", "ar"];

// Returnerer [start, slutt) for valgt periode. Uke starter mandag (nb-locale).
export function periodRange(period: Period, ref = new Date()): [Date, Date] {
  switch (period) {
    case "dag":
      return [startOfDay(ref), endOfDay(ref)];
    case "uke":
      return [
        startOfWeek(ref, { weekStartsOn: 1 }),
        endOfWeek(ref, { weekStartsOn: 1 }),
      ];
    case "maned":
      return [startOfMonth(ref), endOfMonth(ref)];
    case "kvartal":
      return [startOfQuarter(ref), endOfQuarter(ref)];
    case "ar":
      return [startOfYear(ref), endOfYear(ref)];
  }
}
