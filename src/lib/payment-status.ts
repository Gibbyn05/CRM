import type { CommissionStatus } from "./types";

export type PaymentStatus = "paid" | "unpaid" | "overdue";

export function getPaymentStatus(
  row: {
    status: CommissionStatus;
    paid_at: string | null;
    due_at: string | null;
  },
  today = new Date().toISOString().slice(0, 10),
): PaymentStatus {
  if (row.status === "betalt" || row.paid_at) return "paid";
  if (row.status === "forfalt") return "overdue";
  if (row.due_at && row.due_at.slice(0, 10) < today) return "overdue";
  return "unpaid";
}
