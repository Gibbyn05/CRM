import Link from "next/link";
import CallButton from "@/components/CallButton";
import { normalizePhoneNumber, phoneNumbersMatch } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type IncomingCustomer = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  city: string | null;
};

function getParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim().slice(0, 80) ?? "";
}

export default async function IncomingCallPage({
  searchParams,
}: {
  searchParams: { caller?: string | string[]; telefon?: string | string[]; queue?: string | string[] };
}) {
  // Ice kan settes opp med ?caller=${caller}. "telefon" støttes også slik at
  // URL-en er enkel å bruke dersom sentralbordet bruker et annet variabelnavn.
  const caller = getParam(searchParams.caller) || getParam(searchParams.telefon);
  const queue = getParam(searchParams.queue);
  const normalizedCaller = normalizePhoneNumber(caller);
  const supabase = createClient();

  let matches: IncomingCustomer[] = [];
  if (normalizedCaller) {
    // Telefonnummer lagres historisk i litt ulike formater. Vi henter bare
    // rader med nummer og matcher normalisert i appen, så +47/mellomrom ikke
    // gjør at et kjent anrop havner som ukjent.
    const { data } = await supabase
      .from("customers")
      .select("id, name, contact_name, phone, city")
      .not("phone", "is", null)
      .limit(2000);

    matches = ((data as IncomingCustomer[] | null) ?? []).filter((customer) =>
      phoneNumbersMatch(customer.phone, normalizedCaller),
    );
  }

  const displayNumber = normalizedCaller ?? caller;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="rounded-[1.65rem] border border-[#d8cdbb] bg-white p-6 shadow-[0_22px_65px_rgba(62,45,27,0.11)] sm:p-8">
        <p className="label-eyebrow text-brand-700">Innkommende samtale</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-[#251e18]">
              {displayNumber ? `Anrop fra ${displayNumber}` : "Anrop uten telefonnummer"}
            </h1>
            <p className="mt-2 text-sm text-[#74695d]">
              {queue ? `Kø: ${queue}` : "CRM-et søker etter kunden automatisk."}
            </p>
          </div>
          <CallButton phone={normalizedCaller} label="Ring tilbake" />
        </div>
      </section>

      {!normalizedCaller ? (
        <section className="rounded-[1.65rem] border border-dashed border-[#d8cdbb] bg-[#fffaf0] p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-[#251e18]">Mangler gyldig nummer</h2>
          <p className="mt-2 text-sm text-[#74695d]">
            Sentralbordet åpnet siden uten et telefonnummer vi kan slå opp.
          </p>
        </section>
      ) : matches.length === 0 ? (
        <section className="rounded-[1.65rem] border border-dashed border-[#d8cdbb] bg-[#fffaf0] p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-[#251e18]">Ingen kunde funnet</h2>
          <p className="mt-2 text-sm text-[#74695d]">
            Nummeret er ikke registrert på et kundekort som du har tilgang til.
          </p>
          <Link
            href="/customers"
            className="mt-5 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Åpne kunder
          </Link>
        </section>
      ) : (
        <section className="rounded-[1.65rem] border border-[#d8cdbb] bg-white p-5 shadow-[0_14px_38px_rgba(62,45,27,0.08)] sm:p-6">
          <p className="label-eyebrow">{matches.length === 1 ? "Kunde funnet" : "Flere mulige kunder"}</p>
          <div className="mt-3 space-y-3">
            {matches.map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-[#e6dccd] bg-[#fffdfa] p-4 transition hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[#251e18]">{customer.name}</span>
                  <span className="mt-1 block text-sm text-[#74695d]">
                    {[customer.contact_name, customer.phone, customer.city].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-brand-700">Åpne kundekort →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
