import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichCompanyFromProviders } from "@/lib/reachr/providers";
import { findVerified1881Candidates } from "@/lib/reachr/daily-verified-leads";

export const runtime = "nodejs";
export const maxDuration = 300;

const PER_AGENT = 30;

function osloDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: agents, error } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("role", "agent")
    .eq("is_active", true)
    .order("created_at");
  if (error) {
    console.error("[reachr:daily-leads] Kunne ikke hente aktive selgere", error);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  if (!agents?.length) {
    console.info("[reachr:daily-leads] Ingen aktive selgere funnet");
    return NextResponse.json({ ok: true, agents: 0, assigned: 0 });
  }

  const runDate = osloDate();
  const target = agents.length * PER_AGENT * 2;
  const candidates = await findVerified1881Candidates(new Date(), target);
  console.info("[reachr:daily-leads] Kandidater kontrollert", {
    runDate,
    agents: agents.length,
    candidates: candidates.length,
  });
  let cursor = 0;
  const summary: Array<{ owner_id: string; assigned: number; verification_failures: number }> = [];

  for (const agent of agents) {
    const { data: existingRun } = await admin
      .from("reachr_daily_lead_runs")
      .select("assigned_count, status")
      .eq("run_date", runDate)
      .eq("owner_id", agent.id)
      .maybeSingle();
    if (existingRun?.status === "completed") {
      summary.push({ owner_id: agent.id, assigned: existingRun.assigned_count, verification_failures: 0 });
      continue;
    }

    await admin.from("reachr_daily_lead_runs").upsert(
      { run_date: runDate, owner_id: agent.id, requested_count: PER_AGENT, status: "running" },
      { onConflict: "run_date,owner_id" },
    );
    let assigned = 0;
    let failures = 0;
    while (cursor < candidates.length && assigned < PER_AGENT) {
      const candidate = candidates[cursor++];
      const { error: claimError } = await admin
        .from("reachr_lead_claims")
        .insert({ org_number: candidate.orgNumber, owner_id: agent.id });
      if (claimError) continue; // Alltid eksklusivt lead, aldri duplikat.

      const company = await enrichCompanyFromProviders(candidate.orgNumber);
      if (!company) {
        failures++;
        await admin.from("reachr_lead_claims").delete().eq("org_number", candidate.orgNumber);
        continue;
      }
      const { error: leadError } = await admin.from("reachr_leads").insert({
        owner_id: agent.id,
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
        contact_candidates: company.contact_candidates ?? [],
        selected_contact: company.selected_contact ?? null,
        source: "1881 verifisert",
        keywords: candidate.keywords,
        source_metadata: {
          verification: "1881_keyword_directory_and_profile",
          profile_url: candidate.profileUrl,
          matched_term: candidate.matchedTerm,
          verified_at: new Date().toISOString(),
        },
      });
      if (leadError) {
        failures++;
        await admin.from("reachr_lead_claims").delete().eq("org_number", candidate.orgNumber);
        continue;
      }
      assigned++;
    }

    const status = assigned === PER_AGENT ? "completed" : "partial";
    await admin.from("reachr_daily_lead_runs").update({
      assigned_count: assigned,
      verification_failures: failures,
      status,
      details: { candidate_pool: candidates.length, agent_name: agent.full_name },
      completed_at: new Date().toISOString(),
    }).eq("run_date", runDate).eq("owner_id", agent.id);
    await admin.from("notifications").insert({
      user_id: agent.id,
      type: "system",
      title: status === "completed" ? "30 nye 1881-verifiserte leads" : "Færre enn 30 verifiserte leads",
      body: status === "completed"
        ? "Reachr har lagt 30 nye leads med verifiserte 1881-søkeord i Mine leads."
        : `Reachr fant ${assigned} leads som besto den strenge 1881-kontrollen i dag.`,
      link: "/reachr/mine-leads",
    });
    summary.push({ owner_id: agent.id, assigned, verification_failures: failures });
  }
  console.info("[reachr:daily-leads] Fullført", { runDate, candidates: candidates.length, summary });
  return NextResponse.json({ ok: true, run_date: runDate, candidates: candidates.length, summary });
}
