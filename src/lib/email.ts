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

export function dagsavisEmailHtml(opts: {
  title: string;
  intro: string;
  cards: Array<{ label: string; value: string }>;
  summaryText: string;
  sellerRows?: Array<{
    name: string;
    calls: number;
    sales: number;
    revenue: string;
    meetings: number;
  }>;
  appUrl?: string;
}): string {
  const appUrl = opts.appUrl?.replace(/\/$/, "") || "";
  const rows = opts.sellerRows?.length
    ? `
      <table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:14px;">
        <thead>
          <tr>
            ${["Selger", "Samtaler", "Salg", "Omsetning", "Møter"]
              .map(
                (heading) =>
                  `<th style="padding:10px 8px;border-bottom:1px solid #d8c9b0;text-align:left;color:#7b6a54;font-size:11px;text-transform:uppercase;letter-spacing:.14em;">${heading}</th>`,
              )
              .join("")}
          </tr>
        </thead>
        <tbody>
          ${opts.sellerRows
            .map(
              (row) => `
                <tr>
                  <td style="padding:10px 8px;border-bottom:1px solid #efe3ce;color:#2b2118;font-weight:700;">${escapeHtml(row.name)}</td>
                  <td style="padding:10px 8px;border-bottom:1px solid #efe3ce;color:#3d3a34;">${row.calls}</td>
                  <td style="padding:10px 8px;border-bottom:1px solid #efe3ce;color:#3d3a34;">${row.sales}</td>
                  <td style="padding:10px 8px;border-bottom:1px solid #efe3ce;color:#3d3a34;">${escapeHtml(row.revenue)}</td>
                  <td style="padding:10px 8px;border-bottom:1px solid #efe3ce;color:#3d3a34;">${row.meetings}</td>
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>`
    : "";

  return `
  <div style="margin:0;padding:32px 16px;background:#f4ead8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2118;">
    <div style="max-width:720px;margin:0 auto;border:1px solid #d8c9b0;border-radius:28px;overflow:hidden;background:#fffaf0;box-shadow:0 24px 70px rgba(61,44,24,.12);">
      <div style="padding:28px 32px;border-bottom:1px solid #d8c9b0;background:#efe3ce;">
        <p style="margin:0 0 10px;color:#7b6a54;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.2em;">Dagsavisen kl. 20:00</p>
        <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:.95;letter-spacing:-.03em;color:#2b2118;">${escapeHtml(opts.title)}</h1>
        <p style="margin:14px 0 0;color:#6b6660;font-size:15px;line-height:1.65;">${escapeHtml(opts.intro)}</p>
      </div>
      <div style="padding:28px 32px;">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:24px;">
          ${opts.cards
            .map(
              (card) => `
                <div style="border:1px solid #d8c9b0;border-radius:18px;background:#fbf7ed;padding:16px;">
                  <p style="margin:0;color:#7b6a54;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.14em;">${escapeHtml(card.label)}</p>
                  <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;color:#2b2118;font-size:30px;font-weight:700;line-height:1;">${escapeHtml(card.value)}</p>
                </div>`,
            )
            .join("")}
        </div>
        <div style="border-top:2px solid #2b2118;border-bottom:1px solid #d8c9b0;padding:18px 0;">
          <p style="margin:0;color:#7b6a54;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.16em;">Oppsummering</p>
          <p style="margin:10px 0 0;color:#3d3a34;font-size:16px;line-height:1.75;">${escapeHtml(opts.summaryText)}</p>
        </div>
        ${rows}
        ${
          appUrl
            ? `<p style="margin:26px 0 0;text-align:center;"><a href="${escapeAttr(appUrl + "/dashboard")}" style="display:inline-block;background:#09fe94;color:#171717;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:800;">Åpne CRM</a></p>`
            : ""
        }
      </div>
    </div>
  </div>`;
}

export function dagsavisEmailText(opts: {
  title: string;
  cards: Array<{ label: string; value: string }>;
  summaryText: string;
  sellerRows?: Array<{
    name: string;
    calls: number;
    sales: number;
    revenue: string;
    meetings: number;
  }>;
}): string {
  const cards = opts.cards.map((card) => `${card.label}: ${card.value}`).join("\n");
  const sellers = opts.sellerRows?.length
    ? "\n\nSelgere:\n" +
      opts.sellerRows
        .map(
          (row) =>
            `${row.name}: ${row.calls} samtaler, ${row.sales} salg, ${row.revenue}, ${row.meetings} møter`,
        )
        .join("\n")
    : "";
  return `${opts.title}\n\n${cards}\n\nOppsummering:\n${opts.summaryText}${sellers}`;
}

// Enkel, ren HTML-mal for en kontrakt-/tilbudsutsendelse. `bodyText` lar
// selgeren (eller AI-forslaget) sette en egen brødtekst; ellers brukes en
// standard setning.
export function contractEmailHtml(opts: {
  customerName: string;
  signUrl: string;
  senderName?: string;
  bodyText?: string;
  // Branding fra «Min organisasjon» (gjenbruk i maler).
  orgName?: string;
  logoUrl?: string;
  footer?: string;
}): string {
  const { customerName, signUrl, senderName, bodyText, orgName, logoUrl, footer } =
    opts;
  const brand = orgName?.trim() || "Salgssentral";
  const body = bodyText?.trim()
    ? escapeHtml(bodyText.trim()).replace(/\n/g, "<br />")
    : "Vi har sendt deg et tilbud/kontrakt for gjennomgang og signering. Klikk på knappen under for å åpne dokumentet.";

  // Toppfelt: logo hvis satt, ellers firmanavn som tekst.
  const header = logoUrl?.trim()
    ? `<img src="${escapeAttr(logoUrl.trim())}" alt="${escapeHtml(brand)}" style="max-height:40px;max-width:70%;display:block;" />`
    : `<h1 style="margin:0;color:#ffffff;font-size:20px;">${escapeHtml(brand)}</h1>`;

  const signatureLine = senderName
    ? `<p style="margin:24px 0 0;color:#334155;font-size:15px;">Med vennlig hilsen,<br/>${escapeHtml(senderName)}${
        orgName?.trim() ? `<br/>${escapeHtml(orgName.trim())}` : ""
      }</p>`
    : orgName?.trim()
      ? `<p style="margin:24px 0 0;color:#334155;font-size:15px;">Med vennlig hilsen,<br/>${escapeHtml(orgName.trim())}</p>`
      : "";

  const footerLine = footer?.trim()
    ? `<p style="margin:20px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">${escapeHtml(
        footer.trim(),
      ).replace(/\n/g, "<br />")}</p>`
    : "";

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f6f8;padding:32px 0;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#6366f1,#4338ca);padding:28px 32px;">
        ${header}
      </div>
      <div style="padding:32px;">
        <p style="margin:0 0 16px;color:#0f172a;font-size:16px;">Hei ${escapeHtml(customerName)},</p>
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
          ${body}
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
        ${signatureLine}
        ${footerLine}
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

// For bruk i HTML-attributter (f.eks. src="…"). Fjerner farlige tegn slik at
// en URL ikke kan bryte ut av attributtet.
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
