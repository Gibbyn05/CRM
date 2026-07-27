import { createClient } from "@/lib/supabase/server";
import type { PermissionMap, RolePermission, UserRole } from "@/lib/types";
import { buildPermissionMap, emptyMap } from "@/lib/permissions-shared";

// Server-only: leser innlogget brukers rettigheter. Klientkode må importere
// konstanter/hjelpere fra "@/lib/permissions-shared" (denne filen drar inn
// server-klienten via next/headers og kan ikke bunles i klienten).
export {
  RESOURCES,
  RESOURCE_LABELS,
  ACTION_LABELS,
  buildPermissionMap,
} from "@/lib/permissions-shared";

// Henter rettighetene til innlogget bruker (server). Brukes til å gate UI.
export async function getMyPermissions(): Promise<PermissionMap> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyMap(false);

  const [{ data: me }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("role_permissions").select("*"),
  ]);

  const role = (me as { role: UserRole } | null)?.role ?? null;
  return buildPermissionMap(role, (rows as RolePermission[]) ?? []);
}
