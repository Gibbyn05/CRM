import type { NextRequest } from "next/server";

// Henter klientens IP fra proxy-headere. Next.js kjører typisk bak en proxy
// (Vercel, load balancer o.l.), så NextRequest har ikke pålitelig egen
// IP-info – x-forwarded-for/x-real-ip er satt av proxyen foran appen.
// Brukes til revisjonslogg for digital signering (se README: GDPR-notat om
// lovlig grunnlag for IP-lagring).
export function getClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return null;
}
