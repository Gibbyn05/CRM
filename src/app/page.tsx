import { redirect } from "next/navigation";

// Rot-ruten sender videre til live-dashboardet (kjernefunksjonen).
export default function Home() {
  redirect("/live");
}
