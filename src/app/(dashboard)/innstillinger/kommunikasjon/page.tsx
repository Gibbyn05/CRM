import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppointmentSmsReminder, Organization, Profile } from "@/lib/types";
import { isEmailConfigured } from "@/lib/email";
import { isSmsConfigured, getSmsProvider } from "@/lib/providers/sms";
import CommunicationSettings from "@/components/CommunicationSettings";
import MessageLogPanel from "@/components/MessageLogPanel";

export const dynamic = "force-dynamic";

// Innstillinger → Kommunikasjon. Kun ledere: konfigurerer avsenderdomene,
// svaradresse, SMS-leverandør og avtalepåminnelser. Ekte API-nøkler bor i
// miljøvariabler (Vercel) — denne siden viser kun OM de er satt, aldri
// verdien, og lar lederen konfigurere alt det ikke-sensitive rundt dem.
export default async function KommunikasjonPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();
  if (me?.role !== "manager") redirect("/dashboard");

  const [{ data: org }, { data: reminders }, { data: auditLog }] = await Promise.all([
    supabase.from("organization").select("*").eq("id", 1).maybeSingle<Organization>(),
    supabase
      .from("appointment_sms_reminders")
      .select("*, appointments(title, starts_at, customer_id, customers(name))")
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("settings_audit_log")
      .select("*, profiles(full_name)")
      .eq("area", "communication")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kommunikasjon</h1>
        <p className="text-sm text-slate-500">
          Avsenderdomene, svaradresse, SMS-leverandør og avtalepåminnelser.
          Kun synlig for ledere.
        </p>
      </div>

      <CommunicationSettings
        initialOrg={org ?? null}
        emailConfigured={isEmailConfigured()}
        smsConfigured={isSmsConfigured()}
        smsProviderId={getSmsProvider().id}
        auditLog={
          (
            (auditLog as
              | (Record<string, unknown> & { profiles: { full_name: string | null } | null })[]
              | null) ?? []
          ).map((row) => ({
            id: row.id as string,
            summary: row.summary as string,
            created_at: row.created_at as string,
            actor_name: row.profiles?.full_name ?? "Ukjent",
          }))
        }
      />

      <MessageLogPanel
        reminders={
          (
            (reminders as
              | (AppointmentSmsReminder & {
                  appointments: {
                    title: string;
                    starts_at: string;
                    customer_id: string | null;
                    customers: { name: string } | null;
                  } | null;
                })[]
              | null) ?? []
          ).map((r) => ({
            id: r.id,
            recipient_type: r.recipient_type,
            phone_number: r.phone_number,
            status: r.status,
            error: r.error,
            send_at: r.send_at,
            appointment_title: r.appointments?.title ?? "Slettet avtale",
            customer_name: r.appointments?.customers?.name ?? null,
          }))
        }
      />
    </div>
  );
}
