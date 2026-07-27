import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type {
  Contract,
  ContractTemplate,
  Customer,
  Deal,
  DealItem,
  Note,
  Product,
  Profile,
} from "@/lib/types";
import { formatOrgNumber } from "@/lib/format";
import NotesLog from "@/components/NotesLog";
import DealsPanel from "@/components/DealsPanel";
import ContractsPanel from "@/components/ContractsPanel";
import CaseChat from "@/components/CaseChat";
import DeleteCustomerButton from "@/components/DeleteCustomerButton";
import LiveTranscript from "@/components/LiveTranscript";

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
    { data: products },
    { data: contractTemplates },
  ] = await Promise.all([
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
    supabase.from("products").select("*").eq("is_active", true).order("name"),
    supabase.from("contract_templates").select("*").eq("is_active", true).order("name"),
  ]);

  const dealIds = ((deals as Deal[]) ?? []).map((d) => d.id);
  const { data: dealItems } = dealIds.length
    ? await supabase
        .from("deal_items")
        .select("*")
        .in("deal_id", dealIds)
        .order("created_at", { ascending: true })
    : { data: [] as DealItem[] };

  const itemsByDeal = new Map<string, DealItem[]>();
  for (const item of (dealItems as DealItem[]) ?? []) {
    const list = itemsByDeal.get(item.deal_id) ?? [];
    list.push(item);
    itemsByDeal.set(item.deal_id, list);
  }

  const nameMap = new Map(
    ((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

  return (
    <div className="space-y-5">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        ← Tilbake til kunder
      </Link>

      {/* Kundekort-header */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white shadow-sm">
              {customer.name.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-slate-900">
                {customer.name}
              </h1>
              <p className="text-sm text-slate-500">
                Org.nr {formatOrgNumber(customer.org_number)}
              </p>
            </div>
          </div>
          {isManager && (
            <DeleteCustomerButton
              customerId={customer.id}
              customerName={customer.name}
            />
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-4">
          <Field label="Kontakt" value={customer.contact_name ?? "–"} />
          <Field label="E-post" value={customer.email ?? "–"} />
          <Field label="Telefon" value={customer.phone ?? "–"} />
          <Field label="Sted" value={customer.city ?? "–"} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Venstre: transkript + logg + chat */}
        <div className="space-y-4 lg:col-span-2">
          <LiveTranscript customerId={customer.id} />
          <NotesLog
            customerId={customer.id}
            initialNotes={(notes as Note[]) ?? []}
            nameMap={Object.fromEntries(nameMap)}
          />
          <CaseChat
            customerId={customer.id}
            nameMap={Object.fromEntries(nameMap)}
          />
        </div>

        {/* Høyre: deals + kontrakter */}
        <div className="space-y-4">
          <DealsPanel
            customerId={customer.id}
            initialDeals={(deals as Deal[]) ?? []}
            initialItemsByDeal={Object.fromEntries(itemsByDeal)}
            products={(products as Product[]) ?? []}
          />
          <ContractsPanel
            customer={customer}
            initialContracts={(contracts as Contract[]) ?? []}
            deals={(deals as Deal[]) ?? []}
            itemsByDeal={Object.fromEntries(itemsByDeal)}
            templates={(contractTemplates as ContractTemplate[]) ?? []}
            advisorName={nameMap.get(user?.id ?? "") ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 truncate font-medium text-slate-700">{value}</p>
    </div>
  );
}
