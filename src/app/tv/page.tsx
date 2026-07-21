import TvBoard from "@/components/TvBoard";

// Storskjerm-/TV-visning (kiosk). Offentlig rute — ingen innlogging kreves,
// slik at en kontor-TV kan vise tavla direkte. Henter data fra
// /api/live-board og oppdaterer jevnlig.
export const dynamic = "force-dynamic";

export default function TvPage() {
  return <TvBoard />;
}
