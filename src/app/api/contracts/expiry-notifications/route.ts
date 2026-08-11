import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import {
  daysUntilDate,
  osloDate,
  resolveExpiryRecipients,
  type ExpiryRecipient,
} from "@/lib/contract-expiry";

export const runtime = "nodejs";
export const maxDuration = 60;

const NOTICE_DAYS = 30;

interface ExpiringContract {
  id: string;
  customer_id: string;
  agent_id: string | null;
  agreement_end: string;
  customer: { name: string } | { name: string }[] | null;
}

function expiryEmailHtml(input: {
  recipientName: string;
  customerName: string;
  agreementEnd: string;
  daysLeft: number;
  customerUrl: string;
}) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f1e8;padding:32px 16px;color:#2f281f">
    <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #ded3c1;border-radius:18px;overflow:hidden">
      <div style="background:#173f31;color:#fff;padding:24px 28px">
        <div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#b8dcc9">Utløpende avtale</div>
        <div style="margin-top:7px;font-size:24px;font-weight:750">${escapeHtml(input.customerName)}</div>
      </div>
      <div style="padding:28px">
        <p>Hei ${escapeHtml(input.recipientName || "")},</p>
        <p style="line-height:1.65">Avtalen med <strong>${escapeHtml(input.customerName)}</strong> utløper ${escapeHtml(input.agreementEnd)}${input.daysLeft > 0 ? `, om ${input.daysLeft} dager` : ", i dag"}. Vurder fornyelse og avtal oppfølging med kunden.</p>
        <p style="margin:24px 0 0"><a href="${escapeHtml(input.customerUrl)}" style="display:inline-block;background:#16734d;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Åpne kundekortet</a></p>
      </div>
    </div>
  </div>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function dispatchExpiryNotifications() {
  const admin = createAdminClient();
  const today = osloDate();
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + NOTICE_DAYS);
  const limitDate = limit.toISOString().slice(0, 10);

  const [{ data: contracts, error: contractError }, { data: profiles, error: profileError }] =
    await Promise.all([
      admin
        .from("contracts")
        .select("id, customer_id, agent_id, agreement_end, customer:customers(name)")
        .eq("status", "signed")
        .gte("agreement_end", today)
        .lte("agreement_end", limitDate),
      admin.from("profiles").select("id, full_name, email, role, is_active"),
    ]);

  if (contractError) throw new Error(contractError.message);
  if (profileError) throw new Error(profileError.message);

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const result = { contracts: 0, notifications: 0, emails: 0, failed: 0 };

  for (const contract of (contracts as ExpiringContract[] | null) ?? []) {
    result.contracts++;
    const customer = Array.isArray(contract.customer) ? contract.customer[0] : contract.customer;
    const customerName = customer?.name?.trim() || "Ukjent kunde";
    const daysLeft = daysUntilDate(contract.agreement_end, today);
    const recipients = resolveExpiryRecipients(
      (profiles as ExpiryRecipient[] | null) ?? [],
      contract.agent_id,
    );

    for (const recipient of recipients) {
      const { data: delivery, error: claimError } = await admin
        .from("contract_expiry_deliveries")
        .upsert(
          { contract_id: contract.id, user_id: recipient.id, notice_days: NOTICE_DAYS },
          { onConflict: "contract_id,user_id,notice_days", ignoreDuplicates: true },
        )
        .select("id, in_app_created_at, email_sent_at")
        .maybeSingle();
      if (claimError) throw new Error(claimError.message);

      const current = delivery ?? (await admin
        .from("contract_expiry_deliveries")
        .select("id, in_app_created_at, email_sent_at")
        .eq("contract_id", contract.id)
        .eq("user_id", recipient.id)
        .eq("notice_days", NOTICE_DAYS)
        .single()).data;
      if (!current) continue;

      const body = `Avtalen med ${customerName} utløper ${contract.agreement_end}${daysLeft > 0 ? `, om ${daysLeft} dager` : ", i dag"}.`;
      if (!current.in_app_created_at) {
        const { error } = await admin.from("notifications").insert({
          user_id: recipient.id,
          type: "contract",
          title: "Utløpende avtale",
          body,
          link: `/customers/${contract.customer_id}`,
        });
        if (error) {
          result.failed++;
        } else {
          await admin.from("contract_expiry_deliveries").update({ in_app_created_at: new Date().toISOString() }).eq("id", current.id);
          result.notifications++;
        }
      }

      if (!current.email_sent_at) {
        const customerUrl = `${appUrl}/customers/${contract.customer_id}`;
        const email = await sendEmail({
          to: recipient.email,
          subject: `Utløpende avtale: ${customerName}`,
          html: expiryEmailHtml({
            recipientName: recipient.full_name,
            customerName,
            agreementEnd: contract.agreement_end,
            daysLeft,
            customerUrl,
          }),
          text: `${body}\n\nÅpne kundekortet: ${customerUrl}`,
        });
        await admin
          .from("contract_expiry_deliveries")
          .update({
            email_sent_at: email.error ? null : new Date().toISOString(),
            email_error: email.error ?? null,
          })
          .eq("id", current.id);
        if (email.error) result.failed++;
        else result.emails++;
      }
    }
  }

  return result;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await dispatchExpiryNotifications()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil";
    console.error("Varsling om utløpende avtaler feilet:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
