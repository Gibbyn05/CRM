import { formatDistanceToNowStrict, format } from "date-fns";
import { nb } from "date-fns/locale";

// Norske formateringshjelpere.

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "aldri";
  return formatDistanceToNowStrict(new Date(iso), {
    addSuffix: true,
    locale: nb,
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return format(new Date(iso), "d. MMM yyyy 'kl.' HH:mm", { locale: nb });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return format(new Date(iso), "d. MMM yyyy", { locale: nb });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return format(new Date(iso), "HH:mm", { locale: nb });
}

export function formatCurrency(
  amount: number | null | undefined,
  currency = "NOK",
): string {
  if (amount == null) return "–";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Formaterer norsk org.nr som "123 456 789".
export function formatOrgNumber(org: string | null | undefined): string {
  if (!org) return "–";
  return org.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
}

// Validerer norsk org.nr med MOD11-kontrollsiffer.
export function isValidOrgNumber(org: string): boolean {
  if (!/^\d{9}$/.test(org)) return false;
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const digits = org.split("").map(Number);
  const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
  const remainder = sum % 11;
  const control = remainder === 0 ? 0 : 11 - remainder;
  if (control === 10) return false; // ugyldig org.nr
  return control === digits[8];
}
