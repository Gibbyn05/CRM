export const DAILY_UNTOUCHED_LEAD_TARGET = 30;

export interface DailyLeadInventory {
  carriedOver: number;
  required: number;
}

// Leads som ikke er kontaktet blir stående. Bare mangelen opp til den
// daglige arbeidslisten fylles på med nye bedrifter.
export function calculateDailyLeadInventory(untouchedLeadCount: number): DailyLeadInventory {
  const carriedOver = Math.max(0, Math.min(DAILY_UNTOUCHED_LEAD_TARGET, untouchedLeadCount));
  return {
    carriedOver,
    required: DAILY_UNTOUCHED_LEAD_TARGET - carriedOver,
  };
}
