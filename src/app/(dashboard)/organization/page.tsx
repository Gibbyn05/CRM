import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ContractTemplate, Organization, Product, Profile } from "@/lib/types";
import OrganizationForm from "@/components/OrganizationForm";
import ContractTemplatesAdmin from "@/components/ContractTemplatesAdmin";

export const dynamic = "force-dynamic";

// «Min organisasjon» – selskapsinfo, logo og gjenbrukbar maltekst. Kun ledere.
export default async function OrganizationPage() {
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

  const [{ data: org }, { data: templates }, { data: productLinks }, { data: products }] =
    await Promise.all([
      supabase.from("organization").select("*").eq("id", 1).maybeSingle<Organization>(),
      supabase.from("contract_templates").select("*").order("updated_at", { ascending: false }),
      supabase.from("contract_template_products").select("template_id, product_id"),
      supabase.from("products").select("*").order("sort_order", { ascending: true }),
    ]);

  const links = (productLinks ?? []) as { template_id: string; product_id: string }[];
  const templateRows = ((templates ?? []) as ContractTemplate[]).map((template) => ({
    ...template,
    product_ids: links.filter((link) => link.template_id === template.id).map((link) => link.product_id),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Min organisasjon</h1>
        <p className="text-sm text-slate-500">
          Selskapsinformasjon og logo. Brukes automatisk i e-poster og maler.
        </p>
      </div>
      <OrganizationForm initialOrg={org ?? null} />
      <ContractTemplatesAdmin
        initialTemplates={templateRows}
        products={(products ?? []) as Product[]}
      />
    </div>
  );
}
