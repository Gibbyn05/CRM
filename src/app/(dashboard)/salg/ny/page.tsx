import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Product } from "@/lib/types";
import SaleWizard, { type WizardCustomer } from "@/components/SaleWizard";

export const dynamic = "force-dynamic";

// Salgsveiviser: velg produkter → kunde → kontraktsdetaljer → oversikt.
export default async function NyttSalgPage({
  searchParams,
}: {
  searchParams: { customer?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: products }, { data: customers }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("customers")
      .select("id, name, org_number, contact_name, email, phone")
      .order("name", { ascending: true }),
  ]);

  return (
    <SaleWizard
      products={(products as Product[]) ?? []}
      customers={(customers as WizardCustomer[]) ?? []}
      currentUserId={user.id}
      preselectedCustomerId={searchParams.customer ?? null}
    />
  );
}

// Hjelpetype for at page-fila slipper å importere hele Customer.
export type { Customer };
