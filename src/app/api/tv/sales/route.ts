import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
//  GET /api/tv/sales
//  Nylige salg (siste 15 min) for TV-visningen: selgernavn + salgssang.
//  Offentlig (som resten av TV-visningen) – bruker service-role server-side og
//  returnerer kun feiring-data (navn + lyd-URL), ingen sensitiv info.
//  TV-en dedupliserer på id og spiller sangen når et nytt salg dukker opp.
// ============================================================================

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data } = await admin
    .from("commissions")
    .select("id, created_at, agent_id, agent:profiles(full_name, sale_song_url)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  type Row = {
    id: string;
    created_at: string;
    agent_id: string | null;
    agent:
      | { full_name: string | null; sale_song_url: string | null }
      | { full_name: string | null; sale_song_url: string | null }[]
      | null;
  };

  const sales = ((data as Row[]) ?? []).map((r) => {
    const a = Array.isArray(r.agent) ? r.agent[0] : r.agent;
    return {
      id: r.id,
      agent_id: r.agent_id,
      created_at: r.created_at,
      agent_name: a?.full_name || "Selger",
      song_url: a?.sale_song_url ?? null,
    };
  });

  return NextResponse.json({ sales });
}
