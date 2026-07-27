import { createClient } from "@/lib/supabase/server";
import type { Organization } from "@/lib/types";

// Henter singleton-raden med selskapsinfo (id = 1). Returnerer null hvis
// tabellen ennå ikke er migrert (0010), slik at kallende kode kan falle
// tilbake på fornuftige standardverdier.
export async function getOrganization(): Promise<Organization | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("organization")
    .select("*")
    .eq("id", 1)
    .maybeSingle<Organization>();
  return data ?? null;
}
