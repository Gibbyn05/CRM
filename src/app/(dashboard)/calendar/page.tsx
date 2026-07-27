import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Appointment, Customer, EventType, Profile } from "@/lib/types";
import CalendarView from "@/components/CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: appointments },
    { data: customers },
    { data: eventTypes },
    { data: profiles },
    { data: me },
  ] = await Promise.all([
    supabase.from("appointments").select("*").order("starts_at", { ascending: true }),
    supabase.from("customers").select("id, name").order("name"),
    supabase.from("event_types").select("*").order("sort_order"),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  const nameMap = Object.fromEntries(
    ((profiles as Pick<Profile, "id" | "full_name">[]) ?? []).map((p) => [
      p.id,
      p.full_name,
    ]),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kalender</h1>
        <p className="text-sm text-slate-500">
          Planlegg hendelser og møter for teamet
        </p>
      </div>
      <CalendarView
        initialAppointments={(appointments as Appointment[]) ?? []}
        customers={(customers as Pick<Customer, "id" | "name">[]) ?? []}
        initialEventTypes={(eventTypes as EventType[]) ?? []}
        currentUserId={user.id}
        isManager={(me as { role: Profile["role"] } | null)?.role === "manager"}
        nameMap={nameMap}
      />
    </div>
  );
}
