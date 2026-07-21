import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeMetrics, generateSummary } from "@/lib/dagsavis";
import type { Profile } from "@/lib/types";

// ============================================================================
//  Genererer (eller henter) dagsavis for en selger og en dato.
//
//  POST body: { date?: "YYYY-MM-DD", agent_id?: uuid }
//   - Standard dato = i går.
//   - Standard agent = innlogget bruker. Salgssjef kan be om andres.
//   - Idempotent: hvis rapport allerede finnes for (agent, dato), returneres den
//     med mindre force=true.
// ============================================================================

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Uautorisert" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const dateISO: string = body.date ?? yesterdayISO();
  const force: boolean = body.force ?? false;

  // Finn hvilken agent rapporten gjelder.
  const { data: me } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single<Pick<Profile, "id" | "full_name" | "role">>();

  let agentId = user.id;
  let agentName = me?.full_name ?? "Selger";

  if (body.agent_id && body.agent_id !== user.id) {
    if (me?.role !== "manager") {
      return NextResponse.json(
        { error: "Kun salgssjef kan hente andres dagsavis" },
        { status: 403 },
      );
    }
    agentId = body.agent_id;
    const { data: other } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", agentId)
      .single<{ full_name: string }>();
    agentName = other?.full_name ?? "Selger";
  }

  // Bruk service-role for skriving og pålitelig metrikk-aggregering.
  const admin = createAdminClient();

  // Returner eksisterende rapport hvis den finnes (og ikke tvunget).
  if (!force) {
    const { data: existing } = await admin
      .from("daily_reports")
      .select("*")
      .eq("agent_id", agentId)
      .eq("report_date", dateISO)
      .maybeSingle();
    if (existing && existing.summary_text) {
      return NextResponse.json({ report: existing, cached: true });
    }
  }

  // Beregn nøkkeltall og generer AI-oppsummering.
  const metrics = await computeMetrics(admin, agentId, dateISO);

  let summary: string;
  try {
    summary = await generateSummary(agentName, dateISO, metrics);
  } catch (e) {
    console.error("Claude-generering feilet:", e);
    summary =
      "Kunne ikke generere AI-oppsummering akkurat nå. Nøkkeltallene vises likevel.";
  }

  const { data: report, error } = await admin
    .from("daily_reports")
    .upsert(
      {
        agent_id: agentId,
        report_date: dateISO,
        calls_count: metrics.calls_count,
        meetings_confirmed: metrics.meetings_confirmed,
        sales_count: metrics.sales_count,
        rejections_count: metrics.rejections_count,
        summary_text: summary,
        metrics: {
          lost_reasons: metrics.lost_reasons,
        },
        generated_at: new Date().toISOString(),
      },
      { onConflict: "agent_id,report_date" },
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ report, cached: false });
}
