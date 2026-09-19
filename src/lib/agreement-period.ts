export type AgreementPeriodUnit = "day" | "month" | "year";

const UNIT_LABELS: Record<AgreementPeriodUnit, [string, string]> = {
  day: ["dag", "dager"],
  month: ["måned", "måneder"],
  year: ["år", "år"],
};

function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addCalendarMonths(date: Date, months: number): Date {
  const originalDay = date.getUTCDate();
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();

  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(originalDay, lastDayOfTargetMonth)));
}

export function formatAgreementPeriod(count: number, unit: AgreementPeriodUnit): string {
  const normalizedCount = Math.min(99, Math.max(1, Math.trunc(count) || 1));
  const [singular, plural] = UNIT_LABELS[unit];
  return `${normalizedCount} ${normalizedCount === 1 ? singular : plural}`;
}

export function calculateAgreementEndDate(
  startDate: string,
  count: number,
  unit: AgreementPeriodUnit,
): string {
  const start = parseIsoDate(startDate);
  if (!start) return "";

  const normalizedCount = Math.min(99, Math.max(1, Math.trunc(count) || 1));
  const end = new Date(start);

  if (unit === "day") {
    end.setUTCDate(end.getUTCDate() + normalizedCount);
    return toIsoDate(end);
  }

  return toIsoDate(addCalendarMonths(end, unit === "month" ? normalizedCount : normalizedCount * 12));
}
