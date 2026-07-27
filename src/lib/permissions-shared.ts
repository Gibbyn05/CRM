import type {
  PermissionAction,
  PermissionMap,
  PermissionResource,
  RolePermission,
  UserRole,
} from "@/lib/types";

// Rene konstanter og hjelpefunksjoner uten server-avhengigheter, slik at både
// klient- og server-kode trygt kan importere dem. (getMyPermissions med
// server-klienten ligger i permissions.ts.)

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

export function emptyMap(value: boolean): PermissionMap {
  return RESOURCES.reduce((acc, r) => {
    acc[r] = { view: value, create: value, edit: value, delete: value };
    return acc;
  }, {} as PermissionMap);
}

// Bygger en full rettighetsmatrise for en rolle ut fra role_permissions-radene.
// Ledere er alltid fulle administratorer. Manglende rad => fail-open (true).
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
