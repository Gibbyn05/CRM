const CANONICAL_APP_URL = "https://crm.media-norge.com";
const LEGACY_APP_URL = "https://crm.media-norge.no";

// Lenker i e-post og SMS må alltid bruke CRM sitt offentlige domene. Den
// tidligere .no-adressen kan ligge igjen i et gammelt Vercel-miljø, men skal
// aldri sendes til en kunde.
export function getPublicAppUrl(fallback = CANONICAL_APP_URL): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (!configured || configured === LEGACY_APP_URL) return fallback.replace(/\/+$/, "");
  return configured;
}

export { CANONICAL_APP_URL };
