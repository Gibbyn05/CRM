import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Organization, Product, Profile } from "@/lib/types";
import SaleWizard, {
  type WizardCustomer,
  type WizardOrg,
} from "@/components/SaleWizard";

export const dynamic = "force-dynamic";

// Salgsveiviser: velg produkter → kunde → kontrakt → oversikt.
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

  const [{ data: products }, { data: customers }, { data: org }, { data: me }] =
    await Promise.all([
      supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("customers")
        .select("id, name, org_number, contact_name, email, phone, address, postal_code, city")
        .order("name", { ascending: true }),
      supabase
        .from("organization")
        .select("name, org_number, address, postal_code, city")
        .eq("id", 1)
        .maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", user.id).single<
        Pick<Profile, "full_name">
      >(),
    ]);

  const o = org as Pick<
    Organization,
    "name" | "org_number" | "address" | "postal_code" | "city"
  > | null;
  const wizardOrg: WizardOrg = {
    name: o?.name ?? "",
    org_number: o?.org_number ?? null,
    address: [o?.address, [o?.postal_code, o?.city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
  };

  return (
    <SaleWizard
      products={(products as Product[]) ?? []}
      customers={(customers as WizardCustomer[]) ?? []}
      currentUserId={user.id}
      sellerName={me?.full_name ?? ""}
      org={wizardOrg}
      preselectedCustomerId={searchParams.customer ?? null}
    />
  );
}

// Hjelpetype for at page-fila slipper å importere hele Customer.
export type { Customer };
