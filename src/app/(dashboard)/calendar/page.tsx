import { createClient } from "@/lib/supabase/server";
import type { Appointment, Customer } from "@/lib/types";
import CalendarView from "@/components/CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const supabase = createClient();

  const [{ data: appointments }, { data: customers }] = await Promise.all([
    supabase.from("appointments").select("*").order("starts_at", { ascending: true }),
    supabase.from("customers").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kalender</h1>
        <p className="text-sm text-slate-500">Book avtaler og møter</p>
      </div>
      <CalendarView
        initialAppointments={(appointments as Appointment[]) ?? []}
        customers={(customers as Pick<Customer, "id" | "name">[]) ?? []}
      />
    </div>
  );
}
