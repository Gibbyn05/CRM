import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Contract, Customer, Deal, Note, Profile } from "@/lib/types";
import { formatOrgNumber } from "@/lib/format";
import NotesLog from "@/components/NotesLog";
import DealsPanel from "@/components/DealsPanel";
import ContractsPanel from "@/components/ContractsPanel";
import CaseChat from "@/components/CaseChat";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", params.id)
    .single<Customer>();

  if (!customer) notFound();

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

  const nameMap = new Map(
    ((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

  return (
    <div className="space-y-4">
      <Link href="/customers" className="text-sm text-slate-500 hover:underline">
        ← Tilbake til kunder
      </Link>

      {/* Kundekort-header */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-3">
          <Field label="Org.nr" value={formatOrgNumber(customer.org_number)} />
          <Field label="Kontakt" value={customer.contact_name ?? "–"} />
          <Field label="E-post" value={customer.email ?? "–"} />
          <Field label="Telefon" value={customer.phone ?? "–"} />
          <Field label="Sted" value={customer.city ?? "–"} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Venstre: logg + chat */}
        <div className="space-y-4 lg:col-span-2">
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
          />
          <ContractsPanel
            customer={customer}
            initialContracts={(contracts as Contract[]) ?? []}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-400">{label}: </span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
