import { redirect } from "next/navigation";

// Rot-ruten sender videre til dashbordet (som alle roller har tilgang til).
export default function Home() {
  redirect("/dashboard");
}
