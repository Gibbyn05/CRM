import {
  addDays,
  addMonths,
  addQuarters,
  addYears,
  startOfDay,
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfYear,
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
    case "dag": {
      const start = startOfDay(ref);
      return [start, addDays(start, 1)];
    }
    case "uke": {
      const start = startOfWeek(ref, { weekStartsOn: 1 });
      return [start, addDays(start, 7)];
    }
    case "maned": {
      const start = startOfMonth(ref);
      return [start, addMonths(start, 1)];
    }
    case "kvartal": {
      const start = startOfQuarter(ref);
      return [start, addQuarters(start, 1)];
    }
    case "ar": {
      const start = startOfYear(ref);
      return [start, addYears(start, 1)];
    }
  }
}
