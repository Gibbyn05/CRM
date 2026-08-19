import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichCompanyFromProviders } from "@/lib/reachr/providers";
import { findVerified1881Candidates } from "@/lib/reachr/daily-verified-leads";
import { calculateDailyLeadInventory } from "@/lib/reachr/daily-inventory";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  let inventories: Array<{ agent: (typeof agents)[number]; carriedOver: number; required: number }>;
  try {
    inventories = await Promise.all(agents.map(async (agent) => {
      const { count, error: countError } = await admin
        .from("reachr_leads")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", agent.id)
        .eq("status", "Ikke kontaktet");
      if (countError) throw new Error(countError.message);
      return { agent, ...calculateDailyLeadInventory(count ?? 0) };
    }));
  } catch (inventoryError) {
    const message = inventoryError instanceof Error ? inventoryError.message : "Ukjent feil";
    console.error("[reachr:daily-leads] Kunne ikke telle åpne leads", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const runDate = osloDate();
  const requiredTotal = inventories.reduce((total, inventory) => total + inventory.required, 0);
  if (requiredTotal === 0) {
    console.info("[reachr:daily-leads] Arbeidslistene er allerede fulle", {
      runDate,
      agents: inventories.length,
      carriedOver: inventories.map(({ agent, carriedOver }) => ({ owner_id: agent.id, carriedOver })),
    });
    return NextResponse.json({ ok: true, run_date: runDate, agents: inventories.length, assigned: 0 });
  }

  const { data: claims, error: claimsError } = await admin
    .from("reachr_lead_claims")
    .select("org_number");
  if (claimsError) {
    console.error("[reachr:daily-leads] Kunne ikke hente tidligere tildelte leads", claimsError);
    return NextResponse.json({ error: claimsError.message }, { status: 502 });
  }

  const claimedOrgNumbers = new Set((claims ?? []).map((claim) => claim.org_number));
  const candidates = await findVerified1881Candidates(new Date(), requiredTotal * 2, claimedOrgNumbers);
  console.info("[reachr:daily-leads] Kandidater kontrollert", {
    runDate,
    agents: agents.length,
    candidates: candidates.length,
    requiredTotal,
  });
  let cursor = 0;
  const summary: Array<{ owner_id: string; carried_over: number; assigned: number; verification_failures: number }> = [];

  for (const { agent, carriedOver, required } of inventories) {
    if (required === 0) {
      summary.push({ owner_id: agent.id, carried_over: carriedOver, assigned: 0, verification_failures: 0 });
      continue;
    }
    const { data: existingRun } = await admin
      .from("reachr_daily_lead_runs")
      .select("assigned_count, status")
      .eq("run_date", runDate)
      .eq("owner_id", agent.id)
      .maybeSingle();
    if (existingRun?.status === "completed") {
      summary.push({ owner_id: agent.id, carried_over: carriedOver, assigned: existingRun.assigned_count, verification_failures: 0 });
      continue;
    }

    await admin.from("reachr_daily_lead_runs").upsert(
      { run_date: runDate, owner_id: agent.id, requested_count: required, status: "running" },
      { onConflict: "run_date,owner_id" },
    );
    let assigned = 0;
    let failures = 0;
    while (cursor < candidates.length && assigned < required) {
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
        source: "1881 offentlig profil",
        keywords: candidate.keywords,
        source_metadata: {
          verification: "public_1881_keyword_directory_and_profile",
          payment_status: "not_publicly_confirmed",
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

    const status = assigned === required ? "completed" : "partial";
    await admin.from("reachr_daily_lead_runs").update({
      assigned_count: assigned,
      verification_failures: failures,
      status,
      details: {
        candidate_pool: candidates.length,
        agent_name: agent.full_name,
        carried_over: carriedOver,
        requested_new_leads: required,
      },
      completed_at: new Date().toISOString(),
    }).eq("run_date", runDate).eq("owner_id", agent.id);
    await admin.from("notifications").insert({
      user_id: agent.id,
      type: "system",
      title: status === "completed" ? `${assigned} nye 1881-profiler klare` : "Færre nye 1881-profiler enn planlagt",
      body: status === "completed"
        ? `Reachr beholdt ${carriedOver} ubehandlede leads og la til ${assigned} nye leads med offentlig verifiserte 1881-søkeord.`
        : `Reachr beholdt ${carriedOver} ubehandlede leads og fant ${assigned} nye profiler som besto den strenge 1881-kontrollen i dag.`,
      link: "/reachr/mine-leads",
    });
    summary.push({ owner_id: agent.id, carried_over: carriedOver, assigned, verification_failures: failures });
  }
  console.info("[reachr:daily-leads] Fullført", { runDate, candidates: candidates.length, summary });
  return NextResponse.json({ ok: true, run_date: runDate, candidates: candidates.length, summary });
}
