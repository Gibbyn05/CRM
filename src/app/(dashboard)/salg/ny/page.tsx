import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Organization, Product, Profile } from "@/lib/types";
import SaleWizard, {
  type WizardContractTemplate,
  type WizardCustomer,
  type WizardOrg,
} from "@/components/SaleWizard";
import { dedupeCustomers } from "@/lib/dedupe";

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

  const [{ data: products }, { data: customers }, { data: org }, { data: me }, { data: templates }, { data: templateProducts }] =
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
        .select("name, org_number, address, postal_code, city, logo_url")
        .eq("id", 1)
        .maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", user.id).single<
        Pick<Profile, "full_name">
      >(),
      supabase
        .from("contract_templates")
        .select("id, name, description, version")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase.from("contract_template_products").select("template_id, product_id"),
    ]);

  const o = org as Pick<
    Organization,
    "name" | "org_number" | "address" | "postal_code" | "city" | "logo_url"
  > | null;
  const wizardOrg: WizardOrg = {
    name: o?.name ?? "",
    org_number: o?.org_number ?? null,
    address: [o?.address, [o?.postal_code, o?.city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
    logo_url: o?.logo_url ?? null,
  };
  const links = (templateProducts ?? []) as { template_id: string; product_id: string }[];
  const contractTemplates = ((templates ?? []) as Omit<WizardContractTemplate, "product_ids">[]).map((template) => ({
    ...template,
    product_ids: links.filter((link) => link.template_id === template.id).map((link) => link.product_id),
  }));

  return (
    <SaleWizard
      products={(products as Product[]) ?? []}
      customers={dedupeCustomers((customers as WizardCustomer[]) ?? [], searchParams.customer)}
      currentUserId={user.id}
      sellerName={me?.full_name ?? ""}
      org={wizardOrg}
      contractTemplates={contractTemplates}
      preselectedCustomerId={searchParams.customer ?? null}
    />
  );
}

// Hjelpetype for at page-fila slipper å importere hele Customer.
export type { Customer };
