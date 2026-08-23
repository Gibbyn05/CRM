import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ContractTemplate, Organization, Product, Profile, RolePermission, UserInvitation } from "@/lib/types";
import OrganizationForm from "@/components/OrganizationForm";
import ContractTemplatesAdmin from "@/components/ContractTemplatesAdmin";
import UsersAdmin from "@/components/UsersAdmin";
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

  const [{ data: org }, { data: templates }, { data: productLinks }, { data: products }, { data: profiles }, { data: permissions }, { data: invitations }] =
    await Promise.all([
      supabase.from("organization").select("*").eq("id", 1).maybeSingle<Organization>(),
      supabase.from("contract_templates").select("*").order("updated_at", { ascending: false }),
      supabase.from("contract_template_products").select("template_id, product_id"),
      supabase.from("products").select("*").order("sort_order", { ascending: true }),
      supabase
        .from("profiles")
        .select("*")
        .order("is_active", { ascending: false })
        .order("full_name"),
      supabase.from("role_permissions").select("*"),
      supabase
        .from("user_invitations")
        .select("id, email, full_name, role, status, expires_at, sent_at, created_at, email_error")
        .in("status", ["pending", "expired"])
        .order("created_at", { ascending: false }),
    ]);

  const links = (productLinks ?? []) as { template_id: string; product_id: string }[];
  const templateRows = ((templates ?? []) as ContractTemplate[]).map((template) => ({
    ...template,
    product_ids: links.filter((link) => link.template_id === template.id).map((link) => link.product_id),
  }));
  const activeTab = searchParams.tab === "contracts"
    ? "contracts"
    : searchParams.tab === "members"
      ? "members"
      : "company";

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
        <OrganizationTab href="/organization?tab=members" active={activeTab === "members"}>
          Medlemmer
          {((invitations as UserInvitation[]) ?? []).length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {((invitations as UserInvitation[]) ?? []).length}
            </span>
          )}
        </OrganizationTab>
      </nav>

      {activeTab === "company" ? (
        <OrganizationForm initialOrg={org ?? null} />
      ) : activeTab === "contracts" ? (
        <ContractTemplatesAdmin
          initialTemplates={templateRows}
          products={(products ?? []) as Product[]}
        />
      ) : (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Medlemmer</h2>
            <p className="text-sm text-slate-500">Kun ledere kan legge til, administrere eller endre tilgangen til teammedlemmer.</p>
          </div>
          <UsersAdmin
            currentUserId={user.id}
            initialProfiles={(profiles as Profile[]) ?? []}
            initialPermissions={(permissions as RolePermission[]) ?? []}
            initialInvitations={(invitations as UserInvitation[]) ?? []}
          />
        </section>
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
