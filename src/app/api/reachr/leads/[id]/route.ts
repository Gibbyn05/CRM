import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leadRowToReachrLead, ReachrLeadStatus, REACHR_LEAD_STATUSES } from "@/lib/reachr";

export const dynamic = "force-dynamic";

type StoredLead = Record<string, unknown> & {
  id: string;
  owner_id: string;
  customer_id: string | null;
  org_number: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  notes: string | null;
  selected_contact: { subject?: string; verified?: boolean; person_name?: string | null } | null;
};

type LinkedCustomer = { id: string; customer_since: string | null };

function contactName(lead: StoredLead) {
  const contact = lead.selected_contact;
  return contact?.subject === "person" && contact.verified
    ? contact.person_name ?? null
    : null;
}

async function syncPotentialCustomer(
  supabase: ReturnType<typeof createClient>,
  lead: StoredLead,
): Promise<LinkedCustomer> {
  const fields = {
    name: lead.name,
    contact_name: contactName(lead),
    email: lead.email,
    phone: lead.phone,
    address: lead.address,
    postal_code: lead.postal_code,
    city: lead.city,
  };

  let customer: LinkedCustomer | null = null;
  if (lead.customer_id) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_since")
      .eq("id", lead.customer_id)
      .maybeSingle<LinkedCustomer>();
    if (error) throw new Error(error.message);
    customer = data;
  }

  if (!customer) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_since")
      .eq("org_number", lead.org_number)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<LinkedCustomer>();
    if (error) throw new Error(error.message);
    customer = data;
  }

  if (customer) {
    const { error } = await supabase.from("customers").update(fields).eq("id", customer.id);
    if (error) throw new Error(error.message);
    return customer;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      ...fields,
      org_number: lead.org_number,
      owner_id: lead.owner_id,
      created_by: lead.owner_id,
      // customer_since er tom for nye prospekter og vises dermed under
      // «Potensielle kunder» frem til et salg er akseptert.
      customer_since: null,
    })
    .select("id, customer_since")
    .single<LinkedCustomer>();
  if (error || !data) throw new Error(error?.message ?? "Kunne ikke opprette potensielt kundekort.");
  return data;
}

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

  const saveToPotentialCustomers =
    "notes" in body || "email" in body || "phone" in body;

  // Hent forrige notat før oppdateringen. Da kopieres et nytt notat til
  // kundekortet kun når selgeren faktisk har skrevet noe nytt.
  const { data: existingLead, error: existingLeadError } = await supabase
    .from("reachr_leads")
    .select("notes")
    .eq("id", params.id)
    .single<{ notes: string | null }>();
  if (existingLeadError) {
    return NextResponse.json({ error: existingLeadError.message }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("reachr_leads")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Kunne ikke oppdatere lead." }, { status: 500 });

  let updatedLead = data as StoredLead;
  let customer: LinkedCustomer | null = null;
  if (saveToPotentialCustomers) {
    try {
      customer = await syncPotentialCustomer(supabase, updatedLead);

      if (updatedLead.customer_id !== customer.id) {
        const { data: linkedLead, error: linkError } = await supabase
          .from("reachr_leads")
          .update({ customer_id: customer.id })
          .eq("id", params.id)
          .select("*")
          .single();
        if (linkError || !linkedLead) {
          throw new Error(linkError?.message ?? "Kunne ikke koble leadet til kundekortet.");
        }
        updatedLead = linkedLead as StoredLead;
      }

      const nextNotes = updatedLead.notes?.trim() ?? "";
      if (nextNotes && nextNotes !== (existingLead.notes?.trim() ?? "")) {
        const { error: noteError } = await supabase.from("notes").insert({
          customer_id: customer.id,
          author_id: user.id,
          note_type: "general",
          body: nextNotes,
        });
        if (noteError) throw new Error(noteError.message);
      }
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Kunne ikke lagre i Potensielle kunder.";
      return NextResponse.json(
        { error: `Leadet ble oppdatert, men ble ikke lagret i Potensielle kunder: ${message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    lead: leadRowToReachrLead(updatedLead),
    customer: customer
      ? { id: customer.id, kind: customer.customer_since ? "customer" : "potential" }
      : null,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const { data: lead } = await supabase
    .from("reachr_leads")
    .select("org_number")
    .eq("id", params.id)
    .maybeSingle<{ org_number: string }>();
  const { error } = await supabase.from("reachr_leads").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (lead?.org_number) {
    await supabase.from("reachr_lead_claims").delete().eq("org_number", lead.org_number);
  }
  return NextResponse.json({ ok: true });
}
