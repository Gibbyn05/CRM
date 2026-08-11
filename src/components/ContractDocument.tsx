import type { DealItem } from "@/lib/types";
import { formatCurrency, formatOrgNumber } from "@/lib/format";
import SignedContractStamp from "./SignedContractStamp";

interface Party {
  name: string;
  orgNumber?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

interface ContractDocumentProps {
  contractId: string;
  title: string;
  customer: Party;
  organization: Party & { logoUrl?: string | null };
  sellerName?: string | null;
  items: DealItem[];
  amount?: number | null;
  currency?: string | null;
  contractText: string;
  signerName?: string | null;
  signerEmail?: string | null;
  signerPhone?: string | null;
  signedAt?: string | null;
  signingPanel: React.ReactNode;
  preview?: boolean;
}

function addressLines(party: Party) {
  return [
    party.address,
    [party.postalCode, party.city].filter(Boolean).join(" "),
  ].filter(Boolean) as string[];
}

function money(value: number, currency = "NOK") {
  return formatCurrency(value, currency).replace(/\u00a0/g, " ");
}

export default function ContractDocument({
  contractId,
  title,
  customer,
  organization,
  sellerName,
  items,
  amount,
  currency = "NOK",
  contractText,
  signerName,
  signerEmail,
  signerPhone,
  signedAt,
  signingPanel,
  preview = false,
}: ContractDocumentProps) {
  const fallbackTotal = amount ?? 0;
  const total = items.length
    ? items.reduce((sum, item) => sum + Number(item.line_total), 0)
    : fallbackTotal;
  const lines = items.length
    ? items
    : [
        {
          id: "fallback",
          deal_id: "",
          product_id: null,
          name: title || "Avtale",
          description: null,
          unit_price: fallbackTotal,
          quantity: 1,
          billing_type: "engang" as const,
          agreement_start: null,
          agreement_end: null,
          line_total: fallbackTotal,
          created_at: "",
        },
      ];

  return (
    <div className="contract-preview bg-white text-[#595959]">
      <div className="border-b border-[#ededed] px-5 py-5 sm:px-8 print:hidden">
        <h1 className="text-2xl font-bold tracking-tight text-[#181818]">
          Forhåndsvisning av kontrakt
        </h1>
        <p className="mt-1 text-sm font-semibold text-[#5d5d5d]">
          Se gjennom kontrakten slik signatøren vil se den før du sender forespørselen.
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] print:block">
        <article className="min-w-0 px-5 py-8 sm:px-10 lg:px-14 lg:py-12 print:px-0 print:py-0">
          <div className="flex min-h-32 justify-end">
            {organization.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={organization.logoUrl}
                alt={organization.name}
                loading="eager"
                className="h-16 max-w-52 object-contain object-right"
              />
            )}
          </div>

          <div className="mt-8 grid gap-8 text-sm leading-relaxed sm:grid-cols-2">
            <PartyBlock party={customer} />
            <div className="sm:text-right">
              <PartyBlock party={organization} />
              {sellerName && <p className="mt-2">Din ref: {sellerName}</p>}
            </div>
          </div>

          <p className="mt-14 text-sm font-semibold text-[#555]">Salg: {title}</p>
          <h2 className="mt-5 text-2xl font-normal text-[#555]">
            Produkter og tjenester
          </h2>

          <div className="mt-7 overflow-x-auto">
            <table className="w-full min-w-[650px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#e8e8e8] text-left text-xs font-black uppercase tracking-[0.07em] text-[#4f4f4f]">
                  <th className="w-[62%] px-4 py-4">Produkt</th>
                  <th className="px-3 py-4 text-right">Pris</th>
                  <th className="px-3 py-4 text-right">Antall</th>
                  <th className="px-3 py-4 text-right">Linjepris</th>
                  <th className="px-3 py-4 text-right">Totalt</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-4 py-5">
                      <p className="font-semibold text-[#555]">{item.name}</p>
                      {item.description && (
                        <p className="mt-3 max-w-2xl whitespace-pre-wrap leading-relaxed text-[#666]">
                          {item.description}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-5 text-right">
                      {money(Number(item.unit_price), currency ?? "NOK")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-5 text-right">
                      {item.quantity} stk
                    </td>
                    <td className="whitespace-nowrap px-3 py-5 text-right">
                      {money(Number(item.unit_price), currency ?? "NOK")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-5 text-right">
                      {money(Number(item.line_total), currency ?? "NOK")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-end gap-6 bg-[#f3f3f3] px-5 py-5 text-lg font-black text-[#505050]">
            <span>Totalt</span>
            <span>{money(total, currency ?? "NOK")}</span>
          </div>

          <div className="mt-16 whitespace-pre-wrap text-sm leading-[1.55] text-[#555]">
            {contractText || "Avtaleteksten mangler."}
          </div>

          {signedAt && (
            <div className="mt-10 print:break-inside-avoid">
              <SignedContractStamp
                signerName={signerName ?? null}
                signerEmail={signerEmail ?? null}
                signerPhone={signerPhone ?? null}
                signedAt={signedAt}
                contractId={contractId}
              />
            </div>
          )}
        </article>

        <aside className="border-t border-[#ededed] bg-white px-6 py-10 lg:border-l lg:border-t-0 print:hidden">
          <div className="sticky top-8">
            <h2 className="text-2xl font-normal text-[#252525]">
              Ordre #{preview ? "" : contractId.slice(0, 8).toUpperCase()}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#666]">
              {preview
                ? "Kun forhåndsvisning. Det er ikke mulig å signere fra denne visningen."
                : "Les gjennom dokumentet og signer når opplysningene stemmer."}
            </p>
            <div className="mt-8">
              <p className="text-xs uppercase tracking-wide text-[#666]">
                Kontraktspråk
              </p>
              <p className="mt-1 font-semibold text-[#222]">Norsk</p>
            </div>
            <div className="mt-9">
              <h3 className="text-base font-bold text-[#222]">Signaturer</h3>
              <div className="mt-4">{signingPanel}</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PartyBlock({ party }: { party: Party }) {
  return (
    <div>
      <p className="font-semibold">
        {party.name}
        {party.orgNumber ? ` (Orgnr ${formatOrgNumber(party.orgNumber)})` : ""}
      </p>
      {addressLines(party).map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}
