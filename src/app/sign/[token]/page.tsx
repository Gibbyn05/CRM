import SignDocument from "@/components/SignDocument";

// Offentlig signeringsside – ingen innlogging (se middleware). Selve
// henting/signering skjer klient-side mot /api/sign/[token].
export const dynamic = "force-dynamic";

export default function SignPage({ params }: { params: { token: string } }) {
  return <SignDocument token={params.token} />;
}
