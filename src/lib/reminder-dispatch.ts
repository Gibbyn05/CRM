// ============================================================================
//  Rene hjelpefunksjoner for SMS-påminnelse-dispatch (kontrollert retry).
//  Skilt ut fra API-ruten slik at retry-/backoff-logikken kan enhetstestes
//  uten en database.
// ============================================================================

export const MAX_REMINDER_ATTEMPTS = 5;
export const BACKOFF_BASE_MINUTES = 5;

// Eksponentiell backoff: 5, 10, 20, 40, 80 minutter osv.
export function computeBackoffMinutes(attemptCountBeforeThisTry: number): number {
  return BACKOFF_BASE_MINUTES * 2 ** attemptCountBeforeThisTry;
}

// Avgjør om en feilet sending skal prøves på nytt senere (midlertidig feil og
// under maks antall forsøk) eller markeres endelig mislykket.
export function shouldRetry(transient: boolean, nextAttemptCount: number): boolean {
  return transient && nextAttemptCount < MAX_REMINDER_ATTEMPTS;
}
