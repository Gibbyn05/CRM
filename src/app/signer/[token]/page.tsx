import { createAdminClient } from "@/lib/supabase/admin";
import SignForm from "@/components/SignForm";

export const dynamic = "force-dynamic";

// Offentlig signeringsside (ingen innlogging). Kunden åpner lenken fra e-post,
// leser avtaleteksten og signerer elektronisk ved å skrive fullt navn.
export default async function SignerPage({
  params,
}: {
  params: { token: string };
}) {
  const admin = createAdminClient();

  const { data: contract } = await admin
    .from("contracts")
    .select(
      "id, status, contract_text, signer_name, signer_email, signer_phone, signed_at, opened_at, recipient, customer:customers(name)",
    )
    .eq("sign_token", params.token)
    .maybeSingle();

  // Branding hentes separat (ingen FK fra contracts til organization).
  const { data: org } = await admin
    .from("organization")
    .select("name, logo_url")
    .eq("id", 1)
    .maybeSingle();

  if (!contract) {
    return (
      <Shell orgName={(org as { name?: string } | null)?.name}>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">Fant ikke avtalen</h1>
          <p className="mt-2 text-sm text-slate-500">
            Lenken er ugyldig eller utløpt. Ta kontakt med avsenderen.
          </p>
        </div>
      </Shell>
    );
  }

  // Marker som «åpnet» første gang siden vises (uten å overskrive senere status).
  if (contract.status === "sent" && !contract.opened_at) {
    await admin
      .from("contracts")
      .update({ status: "opened", opened_at: new Date().toISOString() })
      .eq("id", contract.id);
  }

  const customer = (Array.isArray(contract.customer)
    ? contract.customer[0]
    : contract.customer) as { name: string | null } | null;

  const orgName = (org as { name?: string | null } | null)?.name?.trim() || undefined;
  const logoUrl =
    (org as { logo_url?: string | null } | null)?.logo_url?.trim() || undefined;

  const alreadySigned = contract.status === "signed";

  return (
    <Shell orgName={orgName} logoUrl={logoUrl}>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            Avtale til signering
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">
            {customer?.name ? `Til ${customer.name}` : "Din avtale"}
          </h1>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <pre className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-5 font-sans text-sm leading-relaxed text-slate-800">
            {contract.contract_text || "Avtaleteksten mangler."}
          </pre>
        </div>

        <SignForm
          token={params.token}
          alreadySigned={alreadySigned}
          initialSignerName={contract.signer_name}
          initialSignerEmail={contract.signer_email ?? contract.recipient}
          initialSignerPhone={contract.signer_phone}
          initialSignedAt={contract.signed_at}
          contractId={contract.id}
        />
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        Elektronisk signering. Navn, tidspunkt og IP-adresse registreres som
        bekreftelse på avtalen.
      </p>
    </Shell>
  );
}

function Shell({
  children,
  orgName,
  logoUrl,
}: {
  children: React.ReactNode;
  orgName?: string;
  logoUrl?: string;
}) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={orgName ?? ""} className="h-9 w-auto" />
          ) : (
            <span className="text-lg font-bold text-slate-900">
              {orgName ?? "Signering"}
            </span>
          )}
        </div>
        {children}
      </div>
    </main>
  );
}
