import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leadRowToReachrLead, ReachrLeadStatus, REACHR_LEAD_STATUSES } from "@/lib/reachr";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    status?: ReachrLeadStatus;
    notes?: string | null;
    email?: string | null;
    phone?: string | null;
    last_contacted_at?: string | null;
  };

  const patch: Record<string, unknown> = {};
  if (body.status && REACHR_LEAD_STATUSES.includes(body.status)) patch.status = body.status;
  if ("notes" in body) patch.notes = body.notes ?? null;
  if ("email" in body) patch.email = body.email ?? null;
  if ("phone" in body) {
    patch.phone = body.phone ?? null;
    // A manually edited number has not passed the provider verification flow.
    // Clear provenance rather than leaving a stale person association behind.
    patch.selected_contact = null;
    patch.contact_candidates = [];
  }
  if ("last_contacted_at" in body) patch.last_contacted_at = body.last_contacted_at ?? null;

  const { data, error } = await supabase
    .from("reachr_leads")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: leadRowToReachrLead(data as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const { error } = await supabase.from("reachr_leads").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
