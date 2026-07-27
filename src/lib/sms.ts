// SMS-utsendelse bak et stabilt leverandør-grensesnitt (samme mønster som
// src/lib/email.ts). Kjører "dry-run" (logger, markerer som sendt) når
// SMS_PROVIDER_API_KEY mangler – nyttig i utvikling/uten avtale.
//
// Prosjektet har ingen eksisterende SMS-leverandør fra før (kun stubbet), så
// dette bygger et tydelig, utskiftbart grensesnitt: sett
// SMS_PROVIDER_API_KEY + SMS_PROVIDER_URL i miljøet og juster request-/
// respons-formatet under til den faktiske leverandøren (f.eks. Sveve/Link
// Mobility) sin API-kontrakt.

export interface SendSmsInput {
  to: string;
  message: string;
}

export interface SendSmsResult {
  provider: string;
  provider_ref: string | null;
  error?: string;
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const apiKey = process.env.SMS_PROVIDER_API_KEY;
  const url = process.env.SMS_PROVIDER_URL;
  const from = process.env.SMS_FROM ?? "Salgssentral";

  if (!apiKey || !url) {
    console.log(`[dry-run] SMS til ${input.to}: ${input.message}`);
    return { provider: "dry-run", provider_ref: null };
  }

  try {
    // TODO: bytt ut med leverandørens faktiske API-kontrakt (endepunkt/auth/
    // respons-format varierer). Grensesnittet (SendSmsInput/-Result) er
    // stabilt for resten av appen uansett hvilken leverandør som kobles på.
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: input.to, message: input.message }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`SMS-leverandør-feil (${res.status}): ${detail}`);
      return { provider: "sms-provider", provider_ref: null, error: detail };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { provider: "sms-provider", provider_ref: data.id ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukjent feil";
    console.error(`SMS-leverandør unntak: ${msg}`);
    return { provider: "sms-provider", provider_ref: null, error: msg };
  }
}
