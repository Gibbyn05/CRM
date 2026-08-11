import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type {
  Appointment,
  CallLog,
  Commission,
  Contract,
  Customer,
  CustomerFile,
  CustomerStatus,
  Deal,
  Note,
  Profile,
  Reminder,
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

  const [
    { data: notes },
    { data: deals },
    { data: contracts },
    { data: profiles },
    { data: calls },
    { data: appointments },
    { data: reminders },
    { data: commissions },
  ] =
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
      supabase.from("profiles").select("id, full_name, email, avatar_url"),
      supabase
        .from("call_logs")
        .select("*")
        .eq("customer_id", params.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("appointments")
        .select("*")
        .eq("customer_id", params.id)
        .order("starts_at", { ascending: false }),
      supabase
        .from("reminders")
        .select("*")
        .eq("customer_id", params.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("commissions")
        .select("*")
        .eq("customer_id", params.id)
        .order("created_at", { ascending: false }),
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
  const authors = Object.fromEntries(
    (
      (profiles as Pick<
        Profile,
        "id" | "full_name" | "email" | "avatar_url"
      >[]) ?? []
    ).map((profile) => [
      profile.id,
      {
        name: profile.full_name || profile.email || "Ukjent",
        avatar_url: profile.avatar_url,
      },
    ]),
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:overflow-hidden">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        ← Tilbake til kunder
      </Link>

      <div className="min-h-0 flex-1 overflow-hidden rounded-[1.65rem] border border-[#d8cdbb] bg-white shadow-[0_22px_65px_rgba(62,45,27,0.11)] lg:grid lg:grid-cols-[minmax(280px,32%)_minmax(0,68%)]">
        <aside className="thin-scroll border-b border-[#ddd4c6] bg-[#fffdfa] lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="border-b border-[#ebe3d7] px-6 pb-6 pt-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="label-eyebrow">Bedriftskunde</p>
                <h1 className="mt-2 break-words font-display text-3xl font-bold leading-[1.05] text-[#251e18]">
                  {customer.name}
                </h1>
                <p className="mt-2 text-sm font-medium text-[#8a8177]">
                  Org.nr {formatOrgNumber(customer.org_number)}
                </p>
              </div>
              {isManager && (
                <DeleteCustomerButton
                  customerId={customer.id}
                  customerName={customer.name}
                />
              )}
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="mb-7">
              <p className="mb-4 text-xs font-black uppercase tracking-[0.14em] text-[#53483e]">
                Om kunden
              </p>
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
          </div>
        </aside>

        <div className="min-h-0 min-w-0 overflow-hidden lg:h-full">
          <CustomerTabs
            customer={customer}
            notes={(notes as Note[]) ?? []}
            deals={(deals as Deal[]) ?? []}
            contracts={(contracts as Contract[]) ?? []}
            calls={(calls as CallLog[]) ?? []}
            appointments={(appointments as Appointment[]) ?? []}
            reminders={(reminders as Reminder[]) ?? []}
            commissions={(commissions as Commission[]) ?? []}
            files={(files as CustomerFile[]) ?? []}
            nameMap={Object.fromEntries(nameMap)}
            authors={authors}
            isManager={isManager}
          />
        </div>
      </div>
    </div>
  );
}
