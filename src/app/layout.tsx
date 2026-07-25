import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
