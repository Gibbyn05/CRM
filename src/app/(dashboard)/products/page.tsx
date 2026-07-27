import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Product, Profile } from "@/lib/types";
import ProductsManager from "@/components/ProductsManager";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, { data: products }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single<Pick<Profile, "role">>(),
    supabase.from("products").select("*").order("name"),
  ]);
  const isManager = me?.role === "manager";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Produkter og priser</h1>
        <p className="text-sm text-slate-500">
          Produktkatalogen som brukes når selgere legger produkter i tilbud
          {isManager ? "" : " (kun salgssjef kan redigere)"}
        </p>
      </div>
      <ProductsManager
        initialProducts={(products as Product[]) ?? []}
        isManager={isManager}
      />
    </div>
  );
}
