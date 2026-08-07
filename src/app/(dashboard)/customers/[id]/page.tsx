import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type {
  Contract,
  Customer,
  CustomerFile,
  CustomerStatus,
  Deal,
  Note,
  Profile,
} from "@/lib/types";
import { formatDate, formatOrgNumber } from "@/lib/format";
import DeleteCustomerButton from "@/components/DeleteCustomerButton";
import CustomerTabs from "@/components/CustomerTabs";
import CustomerStatusControl from "@/components/CustomerStatusControl";
import CustomerContactInfo from "@/components/CustomerContactInfo";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", params.id)
    .single<Customer>();

  if (!customer) notFound();

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single<Pick<Profile, "role">>();
  const isManager = me?.role === "manager";

  const [{ data: notes }, { data: deals }, { data: contracts }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("notes")
        .select("*")
        .eq("customer_id", params.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("deals")
        .select("*")
        .eq("customer_id", params.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contracts")
        .select("*")
        .eq("customer_id", params.id)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name"),
    ]);

  const { data: files } = await supabase
    .from("customer_files")
    .select("*")
    .eq("customer_id", params.id)
    .order("created_at", { ascending: false });

  const { data: customerStatuses } = await supabase
    .from("customer_statuses")
    .select("*")
    .order("sort_order", { ascending: true });

  const nameMap = new Map(
    ((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ]),
  );
  const ownerName = customer.owner_id ? nameMap.get(customer.owner_id) : null;

  return (
    <div className="space-y-5">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        ← Tilbake til kunder
      </Link>

      {/* Kundekort-header: det viktigste øverst */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white shadow-sm">
              {customer.name.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <div className="min-w-0">
              <p className="label-eyebrow">Bedriftskunde</p>
              <h1 className="truncate text-2xl font-bold text-slate-900">
                {customer.name}
              </h1>
              <p className="text-sm text-slate-500">
                Org.nr {formatOrgNumber(customer.org_number)}
              </p>
              {(() => {
                const st = ((customerStatuses as CustomerStatus[]) ?? []).find(
                  (s) => s.id === customer.status_id,
                );
                return st ? (
                  <span
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: `${st.color}22`, color: st.color }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: st.color }}
                    />
                    {st.name}
                  </span>
                ) : null;
              })()}
            </div>
          </div>
          {isManager && (
            <DeleteCustomerButton
              customerId={customer.id}
              customerName={customer.name}
            />
          )}
        </div>
      </div>

      {/* To kolonner: venstre = faste kundefakta, høyre = faner */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Venstre: Om kunden */}
        <aside className="card h-fit p-5 lg:sticky lg:top-4">
          <div className="mb-4">
            <CustomerStatusControl
              customerId={customer.id}
              initialStatusId={customer.status_id}
              statuses={(customerStatuses as CustomerStatus[]) ?? []}
              isManager={isManager}
            />
          </div>
          <CustomerContactInfo
            customerId={customer.id}
            initial={{
              contact_name: customer.contact_name,
              email: customer.email,
              phone: customer.phone,
              address: customer.address,
              postal_code: customer.postal_code,
              city: customer.city,
            }}
            orgNumberDisplay={
              customer.org_number ? formatOrgNumber(customer.org_number) : null
            }
            ownerName={ownerName ?? null}
            createdDisplay={formatDate(customer.created_at)}
          />
        </aside>

        {/* Høyre: fanebasert innhold */}
        <div className="lg:col-span-2">
          <CustomerTabs
            customer={customer}
            notes={(notes as Note[]) ?? []}
            deals={(deals as Deal[]) ?? []}
            contracts={(contracts as Contract[]) ?? []}
            files={(files as CustomerFile[]) ?? []}
            nameMap={Object.fromEntries(nameMap)}
          />
        </div>
      </div>
    </div>
  );
}
