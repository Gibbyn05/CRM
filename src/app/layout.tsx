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
};

// viewport-fit=cover gir tilgang til safe-area (iPhone-hakk/hjemindikator).
// maximumScale settes ikke, slik at brukere fortsatt kan zoome (tilgjengelighet).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4f46e5",
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
