import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";
import { getPublicAppUrl } from "./app-url";

interface RecipientProfile {
  id: string;
  full_name: string;
  email: string;
  role: "agent" | "manager";
  is_active: boolean;
}

interface SignedContractCopy {
  id: string;
  agent_id: string | null;
  contract_text: string | null;
  sign_token: string;
  signer_name: string;
  signer_email: string;
  signer_phone: string;
  signed_at: string;
  customer_name: string;
}

interface SentContractCopy {
  id: string;
  agent_id: string | null;
  contract_text: string | null;
  customer_name: string;
  customer_email: string;
}

export function resolveSignedCopyRecipients(
  profiles: RecipientProfile[],
  agentId: string | null,
): RecipientProfile[] {
  const unique = new Map<string, RecipientProfile>();

  for (const profile of profiles) {
    const email = profile.email.trim().toLowerCase();
    const isSender = profile.id === agentId;
    const isActiveManager = profile.role === "manager" && profile.is_active;
    if (!email || (!isSender && !isActiveManager)) continue;
    if (!unique.has(email)) unique.set(email, profile);
  }

  return [...unique.values()];
}

export async function sendSignedContractCopies(
  admin: SupabaseClient,
  contract: SignedContractCopy,
): Promise<{ sent: number; failed: number }> {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name, email, role, is_active");

  if (error) {
    console.error("Kunne ikke hente mottakere for signert kontrakt:", error.message);
    return { sent: 0, failed: 1 };
  }

  const recipients = resolveSignedCopyRecipients(
    (profiles as RecipientProfile[]) ?? [],
    contract.agent_id,
  );
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  const appUrl = getPublicAppUrl();
  const documentUrl = `${appUrl}/signer/${contract.sign_token}`;
  const signedAt = new Date(contract.signed_at).toLocaleString("nb-NO", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Oslo",
  });

  const results = await Promise.all(
    recipients.map((recipient) =>
      sendEmail({
        to: recipient.email.trim(),
        subject: `Signert kontrakt: ${contract.customer_name}`,
        html: signedContractCopyEmailHtml({
          recipientName: recipient.full_name,
          customerName: contract.customer_name,
          contractText: contract.contract_text ?? "Avtaleteksten mangler.",
          signerName: contract.signer_name,
          signerEmail: contract.signer_email,
          signerPhone: contract.signer_phone,
          signedAt,
          contractReference: contract.id,
          documentUrl,
        }),
        text: signedContractCopyText({
          customerName: contract.customer_name,
          contractText: contract.contract_text ?? "Avtaleteksten mangler.",
          signerName: contract.signer_name,
          signerEmail: contract.signer_email,
          signerPhone: contract.signer_phone,
          signedAt,
          contractReference: contract.id,
          documentUrl,
        }),
      }),
    ),
  );

  for (const result of results) {
    if (result.error) console.error("Kunne ikke sende kopi av signert kontrakt:", result.error);
  }

  const failed = results.filter((result) => Boolean(result.error)).length;
  return { sent: results.length - failed, failed };
}

// Når en kontrakt sendes til kunden, får ansvarlig selger og aktive ledere en
// kopi. Dette skjer før signering, slik at teamet kan følge opp utsendelsen.
export async function sendContractSentCopies(
  admin: SupabaseClient,
  contract: SentContractCopy,
): Promise<{ sent: number; failed: number }> {
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name, email, role, is_active");

  if (error) {
    console.error("Kunne ikke hente mottakere for utsendt kontrakt:", error.message);
    return { sent: 0, failed: 1 };
  }

  const recipients = resolveSignedCopyRecipients(
    (profiles as RecipientProfile[]) ?? [],
    contract.agent_id,
  );
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  const results = await Promise.all(
    recipients.map((recipient) =>
      sendEmail({
        to: recipient.email.trim(),
        subject: `Kontrakt sendt: ${contract.customer_name}`,
        html: sentContractCopyEmailHtml({
          recipientName: recipient.full_name,
          customerName: contract.customer_name,
          customerEmail: contract.customer_email,
          contractText: contract.contract_text ?? "Avtaleteksten mangler.",
          contractReference: contract.id,
        }),
        text: sentContractCopyText({
          customerName: contract.customer_name,
          customerEmail: contract.customer_email,
          contractText: contract.contract_text ?? "Avtaleteksten mangler.",
          contractReference: contract.id,
        }),
      }),
    ),
  );

  for (const result of results) {
    if (result.error) console.error("Kunne ikke sende kopi av kontrakt:", result.error);
  }
  const failed = results.filter((result) => Boolean(result.error)).length;
  return { sent: results.length - failed, failed };
}

interface CopyTemplateInput {
  customerName: string;
  contractText: string;
  signerName: string;
  signerEmail: string;
  signerPhone: string;
  signedAt: string;
  contractReference: string;
  documentUrl: string;
}

function signedContractCopyEmailHtml(
  input: CopyTemplateInput & { recipientName: string },
): string {
  const greeting = input.recipientName.trim()
    ? `Hei ${escapeHtml(input.recipientName.trim())},`
    : "Hei,";
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;padding:32px 16px;color:#17211b">
      <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #d8ded9;border-radius:16px;overflow:hidden">
        <div style="background:#142019;color:#fff;padding:24px 28px">
          <div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9bd2b4">Signert kontrakt</div>
          <div style="margin-top:6px;font-size:22px;font-weight:750">${escapeHtml(input.customerName)}</div>
        </div>
        <div style="padding:28px">
          <p style="margin:0 0 18px;font-size:15px">${greeting}</p>
          <p style="margin:0 0 22px;line-height:1.6;color:#465149">Kontrakten er signert. Under finner du en kopi av avtaleteksten og registrert signeringsinformasjon.</p>
          <div style="border:2px solid #18734a;background:#effaf4;border-radius:12px;padding:18px;margin-bottom:22px">
            <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#18734a">Elektronisk signeringsbekreftelse</div>
            <div style="margin-top:10px;font-size:18px;font-weight:750">${escapeHtml(input.signerName)}</div>
            <table style="margin-top:12px;width:100%;font-size:13px;line-height:1.7;color:#2f4438">
              <tr><td style="font-weight:700;width:120px">E-post</td><td>${escapeHtml(input.signerEmail)}</td></tr>
              <tr><td style="font-weight:700">Telefon</td><td>${escapeHtml(input.signerPhone)}</td></tr>
              <tr><td style="font-weight:700">Signert</td><td>${escapeHtml(input.signedAt)}</td></tr>
              <tr><td style="font-weight:700">Referanse</td><td>${escapeHtml(input.contractReference)}</td></tr>
            </table>
          </div>
          <div style="white-space:pre-wrap;border:1px solid #d8ded9;border-radius:12px;background:#fafbf9;padding:20px;font:14px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#263229">${escapeHtml(input.contractText)}</div>
          <p style="margin:24px 0 0;text-align:center"><a href="${escapeAttribute(input.documentUrl)}" style="display:inline-block;background:#18734a;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:9px">Åpne signert dokument</a></p>
        </div>
      </div>
    </div>`;
}

function signedContractCopyText(input: CopyTemplateInput): string {
  return `Kontrakten med ${input.customerName} er signert.

SIGNERINGSINFORMASJON
Navn: ${input.signerName}
E-post: ${input.signerEmail}
Telefon: ${input.signerPhone}
Signert: ${input.signedAt}
Referanse: ${input.contractReference}

KONTRAKT
${input.contractText}

Åpne signert dokument: ${input.documentUrl}`;
}

function sentContractCopyEmailHtml(input: {
  recipientName: string;
  customerName: string;
  customerEmail: string;
  contractText: string;
  contractReference: string;
}): string {
  const greeting = input.recipientName.trim() ? `Hei ${escapeHtml(input.recipientName.trim())},` : "Hei,";
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;padding:32px 16px;color:#17211b"><div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #d8ded9;border-radius:16px;overflow:hidden"><div style="background:#142019;color:#fff;padding:24px 28px"><div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9bd2b4">Kontrakt sendt</div><div style="margin-top:6px;font-size:22px;font-weight:750">${escapeHtml(input.customerName)}</div></div><div style="padding:28px"><p style="margin:0 0 18px;font-size:15px">${greeting}</p><p style="margin:0 0 22px;line-height:1.6;color:#465149">Kontrakten er sendt til kunden for elektronisk signering.</p><p style="margin:0 0 18px;font-size:14px;color:#465149"><strong>Mottaker:</strong> ${escapeHtml(input.customerEmail)}<br /><strong>Referanse:</strong> ${escapeHtml(input.contractReference)}</p><div style="white-space:pre-wrap;border:1px solid #d8ded9;border-radius:12px;background:#fafbf9;padding:20px;font:14px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#263229">${escapeHtml(input.contractText)}</div></div></div></div>`;
}

function sentContractCopyText(input: {
  customerName: string;
  customerEmail: string;
  contractText: string;
  contractReference: string;
}): string {
  return `Kontrakt sendt til ${input.customerName} for signering.

Mottaker: ${input.customerEmail}
Referanse: ${input.contractReference}

KONTRAKT
${input.contractText}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
