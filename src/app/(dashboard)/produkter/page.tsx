import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Product, Profile } from "@/lib/types";
import ProductsAdmin from "@/components/ProductsAdmin";

export const dynamic = "force-dynamic";

// Produkt-/tjenestekatalog. Ledere vedlikeholder produktene som selgerne
// legger til i salgsveiviseren.
export default async function ProductsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();
  if (me?.role !== "manager") redirect("/dashboard");

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Produkter</h1>
        <p className="text-sm text-slate-500">
          Produkt- og tjenestekatalogen selgerne bruker når de lager tilbud.
        </p>
      </div>
      <ProductsAdmin initialProducts={(products as Product[]) ?? []} />
    </div>
  );
}
