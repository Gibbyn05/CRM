import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Selvhostet (ingen ekstern nettverksforespørsel), variabel font eksponert
// som --font-sans i tailwind.config.ts. Fullfører font-feature-settings i
// globals.css, som allerede målretter Inters egne cv0x-varianter.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Salgssentral – CRM",
  description: "Internt sales-dashboard for callcenter",
  // Gjør at appen kan legges til på hjemskjerm (iOS) og oppfører seg som app.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Salgssentral",
  },
  // Next sin Metadata-API har ikke et eget felt for denne ennå (kun Apple-
  // varianten over) — den ikke-prefiksede taggen er nå standarden på tvers
  // av nettlesere, så begge sendes.
  other: {
    "mobile-web-app-capable": "yes",
  },
};

// viewport-fit=cover gir tilgang til safe-area (iPhone-hakk/hjemindikator).
// maximumScale settes ikke, slik at brukere fortsatt kan zoome (tilgjengelighet).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4ead8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
