import { createClient } from "@/lib/supabase/server";
import type {
  PermissionAction,
  PermissionMap,
  PermissionResource,
  RolePermission,
  UserRole,
} from "@/lib/types";

export const RESOURCES: PermissionResource[] = [
  "customers",
  "contracts",
  "events",
  "products",
];

export const RESOURCE_LABELS: Record<PermissionResource, string> = {
  customers: "Kundekort",
  contracts: "Kontrakter",
  events: "Hendelser",
  products: "Produkter",
};

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Se",
  create: "Opprette",
  edit: "Endre",
  delete: "Slette",
};

const ALL_TRUE: Record<PermissionAction, boolean> = {
  view: true,
  create: true,
  edit: true,
  delete: true,
};

function emptyMap(value: boolean): PermissionMap {
  return RESOURCES.reduce((acc, r) => {
    acc[r] = { view: value, create: value, edit: value, delete: value };
    return acc;
  }, {} as PermissionMap);
}

// Bygger en full rettighetsmatrise for en gitt rolle ut fra role_permissions-
// radene. Ledere er alltid fulle administratorer. Manglende rad => fail-open
// (true), likt has_perm() i databasen.
export function buildPermissionMap(
  role: UserRole | null,
  rows: RolePermission[],
): PermissionMap {
  if (role === "manager") return emptyMap(true);
  const map = emptyMap(true); // fail-open default
  for (const row of rows) {
    if (row.role !== role) continue;
    if (!RESOURCES.includes(row.resource)) continue;
    map[row.resource] = {
      view: row.can_view,
      create: row.can_create,
      edit: row.can_edit,
      delete: row.can_delete,
    };
  }
  return map;
}

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

export { ALL_TRUE };
