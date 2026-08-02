import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  leadRowToReachrLead,
  ReachrCompany,
  ReachrLeadStatus,
  REACHR_LEAD_STATUSES,
} from "@/lib/reachr";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const { data, error } = await supabase
    .from("reachr_leads")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: ((data ?? []) as Record<string, unknown>[]).map(leadRowToReachrLead) });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Uautorisert" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { company?: ReachrCompany; status?: ReachrLeadStatus } | null;
  const company = body?.company;
  if (!company?.org_number || !company.name) {
    return NextResponse.json({ error: "Mangler firmadata." }, { status: 400 });
  }

  const status = body?.status && REACHR_LEAD_STATUSES.includes(body.status)
    ? body.status
    : "Ikke kontaktet";

  const existingCustomer = await supabase
    .from("customers")
    .select("id")
    .eq("org_number", company.org_number)
    .maybeSingle<{ id: string }>();

  let customerId = existingCustomer.data?.id ?? null;
  if (!customerId) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        name: company.name,
        org_number: company.org_number,
        contact_name:
          company.roles?.find((role) => ["DAGL", "LEDE"].includes(role.role_code))?.name ??
          null,
        email: company.email,
        phone: company.phone,
        address: company.address.address,
        postal_code: company.address.postal_code,
        city: company.address.city,
        owner_id: user.id,
        created_by: user.id,
      })
      .select("id")
      .single<{ id: string }>();

    if (customerError) {
      return NextResponse.json({ error: customerError.message }, { status: 500 });
    }
    customerId = customer.id;
  }

  const { data, error } = await supabase
    .from("reachr_leads")
    .upsert(
      {
        owner_id: user.id,
        org_number: company.org_number,
        name: company.name,
        organization_form_code: company.organization_form_code,
        organization_form: company.organization_form,
        industry_code: company.industry_code,
        industry: company.industry,
        employees: company.employees,
        website: company.website,
        email: company.email,
        phone: company.phone,
        founded_at: company.founded_at,
        vat_registered: company.vat_registered,
        business_register_registered: company.business_register_registered,
        bankrupt: company.bankrupt,
        under_liquidation: company.under_liquidation,
        purpose: company.purpose,
        address: company.address.address,
        postal_code: company.address.postal_code,
        city: company.address.city,
        municipality: company.address.municipality,
        financial_year: company.financials?.year ?? null,
        revenue: company.financials?.revenue ?? null,
        operating_result: company.financials?.operating_result ?? null,
        annual_result: company.financials?.annual_result ?? null,
        equity: company.financials?.equity ?? null,
        assets: company.financials?.assets ?? null,
        debt: company.financials?.debt ?? null,
        roles: company.roles ?? [],
        customer_id: customerId,
        status,
        source: "Brreg",
      },
      { onConflict: "owner_id,org_number" },
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: leadRowToReachrLead(data as Record<string, unknown>) }, { status: 201 });
}
