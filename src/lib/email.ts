// Tynn Resend-integrasjon via REST (ingen ekstra avhengighet). Sender e-post
// når RESEND_API_KEY er satt; ellers kjøres en "dry-run" som logger og lar
// resten av flyten fortsette (nyttig i utvikling/uten nøkkel).
//
// Env:
//   RESEND_API_KEY  – API-nøkkel fra Resend (server-only, aldri NEXT_PUBLIC).
//   EMAIL_FROM      – avsender, f.eks. "Salgssentral <noreply@reachr.no>".

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  provider: string;
  provider_ref: string | null;
  error?: string;
}

const DEFAULT_FROM = "Salgssentral <onboarding@resend.dev>";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM;

  if (!key) {
    console.log(`[dry-run] E-post til ${input.to}: ${input.subject}`);
    return { provider: "dry-run", provider_ref: null };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`Resend-feil (${res.status}): ${detail}`);
      return { provider: "resend", provider_ref: null, error: detail };
    }

    const data = (await res.json()) as { id?: string };
    return { provider: "resend", provider_ref: data.id ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukjent feil";
    console.error(`Resend unntak: ${msg}`);
    return { provider: "resend", provider_ref: null, error: msg };
  }
}

// Enkel, ren HTML-mal for en kontrakt-/tilbudsutsendelse.
export function contractEmailHtml(opts: {
  customerName: string;
  signUrl: string;
  senderName?: string;
}): string {
  const { customerName, signUrl, senderName } = opts;
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f6f8;padding:32px 0;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#6366f1,#4338ca);padding:28px 32px;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;">Salgssentral</h1>
      </div>
      <div style="padding:32px;">
        <p style="margin:0 0 16px;color:#0f172a;font-size:16px;">Hei ${escapeHtml(customerName)},</p>
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
          Vi har sendt deg et tilbud/kontrakt for gjennomgang og signering.
          Klikk på knappen under for å åpne dokumentet.
        </p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${signUrl}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">
            Åpne og signer
          </a>
        </p>
        <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
          Fungerer ikke knappen? Kopier denne lenken:<br />
          <a href="${signUrl}" style="color:#4f46e5;">${escapeHtml(signUrl)}</a>
        </p>
        ${
          senderName
            ? `<p style="margin:24px 0 0;color:#334155;font-size:15px;">Med vennlig hilsen,<br/>${escapeHtml(senderName)}</p>`
            : ""
        }
      </div>
    </div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
