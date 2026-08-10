interface SignedContractStampProps {
  signerName: string | null;
  signerEmail: string | null;
  signerPhone: string | null;
  signedAt: string | null;
  contractId?: string;
}

export default function SignedContractStamp({
  signerName,
  signerEmail,
  signerPhone,
  signedAt,
  contractId,
}: SignedContractStampProps) {
  const signedTime = signedAt
    ? new Date(signedAt).toLocaleString("nb-NO", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Europe/Oslo",
      })
    : "Tidspunkt ikke registrert";

  return (
    <section
      aria-label="Signeringsbekreftelse"
      className="relative overflow-hidden rounded-xl border-2 border-emerald-700 bg-emerald-50 p-5 text-left shadow-sm print:break-inside-avoid print:border-emerald-900 print:bg-white print:shadow-none"
    >
      <div className="absolute right-4 top-4 rotate-[-7deg] rounded border-2 border-emerald-700 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-800 opacity-80">
        Signert
      </div>
      <div className="flex items-start gap-3 pr-24">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xl font-bold text-white">
          ✓
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">
            Elektronisk signeringsbekreftelse
          </p>
          <p className="mt-1 text-lg font-bold text-emerald-950">
            {signerName || "Navn ikke registrert"}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-emerald-200 pt-4 text-sm sm:grid-cols-2">
        <StampField label="E-post" value={signerEmail || "Ikke registrert"} />
        <StampField label="Telefon" value={signerPhone || "Ikke registrert"} />
        <StampField label="Signert" value={signedTime} />
        {contractId && (
          <StampField label="Referanse" value={contractId.toUpperCase()} mono />
        )}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-emerald-800">
        Signatøren har bekreftet at avtalen er lest og akseptert. Tidspunkt og
        teknisk signeringsinformasjon er registrert i systemets revisjonsspor.
      </p>
    </section>
  );
}

function StampField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
        {label}
      </dt>
      <dd className={`mt-0.5 break-words font-semibold text-emerald-950 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
