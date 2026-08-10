import { createAdminClient } from "@/lib/supabase/admin";
import type { DealItem, Organization } from "@/lib/types";
import ContractDocument from "@/components/ContractDocument";
import SignForm from "@/components/SignForm";

export const dynamic = "force-dynamic";

export default async function SignerPage({
  params,
}: {
  params: { token: string };
}) {
  const admin = createAdminClient();

  const { data: contract } = await admin
    .from("contracts")
    .select(
      "id, deal_id, agent_id, status, contract_text, signer_name, signer_email, signer_phone, signed_at, opened_at, recipient, customer:customers(name, org_number, address, postal_code, city)",
    )
    .eq("sign_token", params.token)
    .maybeSingle();

  const { data: org } = await admin
    .from("organization")
    .select("name, org_number, address, postal_code, city, logo_url")
    .eq("id", 1)
    .maybeSingle();

  if (!contract) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f4f4] p-4">
        <div className="max-w-md rounded-xl border border-[#ddd] bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#222]">Fant ikke avtalen</h1>
          <p className="mt-2 text-sm text-[#666]">
            Lenken er ugyldig eller utløpt. Ta kontakt med avsenderen.
          </p>
        </div>
      </main>
    );
  }

  if (contract.status === "sent" && !contract.opened_at) {
    await admin
      .from("contracts")
      .update({ status: "opened", opened_at: new Date().toISOString() })
      .eq("id", contract.id);
  }

  const [{ data: deal }, { data: items }, { data: seller }] = await Promise.all([
    contract.deal_id
      ? admin
          .from("deals")
          .select("title, amount, currency")
          .eq("id", contract.deal_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    contract.deal_id
      ? admin
          .from("deal_items")
          .select("*")
          .eq("deal_id", contract.deal_id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    contract.agent_id
      ? admin
          .from("profiles")
          .select("full_name")
          .eq("id", contract.agent_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const customer = (Array.isArray(contract.customer)
    ? contract.customer[0]
    : contract.customer) as {
    name: string | null;
    org_number: string | null;
    address: string | null;
    postal_code: string | null;
    city: string | null;
  } | null;
  const organization = org as Pick<
    Organization,
    "name" | "org_number" | "address" | "postal_code" | "city" | "logo_url"
  > | null;
  const alreadySigned = contract.status === "signed";

  const signingPanel = (
    <SignForm
      token={params.token}
      alreadySigned={alreadySigned}
      initialSignerName={contract.signer_name}
      initialSignerEmail={contract.signer_email ?? contract.recipient}
      initialSignerPhone={contract.signer_phone}
      initialSignedAt={contract.signed_at}
      contractId={contract.id}
      compact
    />
  );

  return (
    <main className="min-h-screen bg-[#f2f2f2] p-0 lg:p-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-[1500px] overflow-hidden bg-white shadow-[0_12px_45px_rgba(0,0,0,0.08)] print:max-w-none print:shadow-none">
        <ContractDocument
          contractId={contract.id}
          title={(deal as { title?: string } | null)?.title ?? "Avtale"}
          customer={{
            name: customer?.name ?? "Kunde",
            orgNumber: customer?.org_number,
            address: customer?.address,
            postalCode: customer?.postal_code,
            city: customer?.city,
          }}
          organization={{
            name: organization?.name ?? "Leverandør",
            orgNumber: organization?.org_number,
            address: organization?.address,
            postalCode: organization?.postal_code,
            city: organization?.city,
            logoUrl: organization?.logo_url,
          }}
          sellerName={(seller as { full_name?: string | null } | null)?.full_name}
          items={(items as DealItem[]) ?? []}
          amount={(deal as { amount?: number | null } | null)?.amount}
          currency={(deal as { currency?: string | null } | null)?.currency}
          contractText={contract.contract_text ?? ""}
          signerName={contract.signer_name}
          signerEmail={contract.signer_email}
          signerPhone={contract.signer_phone}
          signedAt={contract.signed_at}
          signingPanel={signingPanel}
        />
      </div>
      <p className="py-5 text-center text-xs text-[#777] print:hidden">
        Elektronisk signering. Navn, tidspunkt og IP-adresse registreres som
        bekreftelse på avtalen.
      </p>
    </main>
  );
}
