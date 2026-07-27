import CustomerSearch from "@/components/CustomerSearch";
import { getMyPermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const perms = await getMyPermissions();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kunder</h1>
          <p className="text-sm text-slate-500">
            Søk på navn eller organisasjonsnummer
          </p>
        </div>
      </div>
      <CustomerSearch
        initialQuery={searchParams.q ?? ""}
        canCreate={perms.customers.create}
      />
    </div>
  );
}
