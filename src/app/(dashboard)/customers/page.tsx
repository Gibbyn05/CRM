import CustomerSearch from "@/components/CustomerSearch";

export const dynamic = "force-dynamic";

export default function CustomersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
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
      <CustomerSearch initialQuery={searchParams.q ?? ""} />
    </div>
  );
}
