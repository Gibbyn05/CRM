import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ContractTemplate, Organization, Product, Profile } from "@/lib/types";
import OrganizationForm from "@/components/OrganizationForm";
import ContractTemplatesAdmin from "@/components/ContractTemplatesAdmin";
import Link from "next/link";

export const dynamic = "force-dynamic";

// «Min organisasjon» – selskapsinfo, logo og gjenbrukbar maltekst. Kun ledere.
export default async function OrganizationPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
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
  const activeTab = searchParams.tab === "contracts" ? "contracts" : "company";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Min organisasjon</h1>
        <p className="text-sm text-slate-500">
          Administrer selskapsdata og kontraktsoppsett fra ett sted.
        </p>
      </div>

      <nav aria-label="Organisasjonsinnstillinger" className="flex gap-1 border-b border-slate-200">
        <OrganizationTab href="/organization" active={activeTab === "company"}>
          Selskapsinformasjon
        </OrganizationTab>
        <OrganizationTab href="/organization?tab=contracts" active={activeTab === "contracts"}>
          Kontraktsmaler
          {templateRows.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {templateRows.length}
            </span>
          )}
        </OrganizationTab>
      </nav>

      {activeTab === "company" ? (
        <OrganizationForm initialOrg={org ?? null} />
      ) : (
        <ContractTemplatesAdmin
          initialTemplates={templateRows}
          products={(products ?? []) as Product[]}
        />
      )}
    </div>
  );
}

function OrganizationTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
        active
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
      }`}
    >
      {children}
    </Link>
  );
}
