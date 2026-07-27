"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  PermissionAction,
  PermissionResource,
  RolePermission,
  UserRole,
} from "@/lib/types";
import {
  ACTION_LABELS,
  RESOURCE_LABELS,
  RESOURCES,
} from "@/lib/permissions";
import Icon from "./Icon";

const ACTIONS: PermissionAction[] = ["view", "create", "edit", "delete"];
const ROLE_LABELS: Record<UserRole, string> = { agent: "Selger", manager: "Leder" };

type Key = `${UserRole}:${PermissionResource}`;

function keyOf(role: UserRole, resource: PermissionResource): Key {
  return `${role}:${resource}`;
}

// Redigerbar rettighetsmatrise. Ledere er alltid fulle administratorer, så
// bare selger-rollen er redigerbar (leder-raden vises låst for oversikt).
export default function PermissionMatrix({
  initialPermissions,
}: {
  initialPermissions: RolePermission[];
}) {
  const supabase = createClient();

  const initialMap = useMemo(() => {
    const m = new Map<Key, RolePermission>();
    for (const p of initialPermissions) {
      if (RESOURCES.includes(p.resource)) m.set(keyOf(p.role, p.resource), p);
    }
    // Sørg for at alle celler finnes (fail-open default = true, delete = false).
    for (const role of ["agent", "manager"] as UserRole[]) {
      for (const resource of RESOURCES) {
        const k = keyOf(role, resource);
        if (!m.has(k)) {
          m.set(k, {
            role,
            resource,
            can_view: true,
            can_create: true,
            can_edit: true,
            can_delete: role === "manager",
            updated_at: new Date().toISOString(),
          });
        }
      }
    }
    return m;
  }, [initialPermissions]);

  const [rows, setRows] = useState<Map<Key, RolePermission>>(initialMap);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function valueOf(row: RolePermission, action: PermissionAction): boolean {
    return action === "view"
      ? row.can_view
      : action === "create"
        ? row.can_create
        : action === "edit"
          ? row.can_edit
          : row.can_delete;
  }

  async function toggle(
    role: UserRole,
    resource: PermissionResource,
    action: PermissionAction,
  ) {
    const k = keyOf(role, resource);
    const current = rows.get(k)!;
    const nextVal = !valueOf(current, action);
    const col =
      action === "view"
        ? "can_view"
        : action === "create"
          ? "can_create"
          : action === "edit"
            ? "can_edit"
            : "can_delete";

    const updated: RolePermission = { ...current, [col]: nextVal };
    // Optimistisk oppdatering.
    setRows((m) => new Map(m).set(k, updated));
    setSavingKey(`${k}:${action}`);
    setMessage(null);

    const { error } = await supabase.from("role_permissions").upsert({
      role,
      resource,
      can_view: updated.can_view,
      can_create: updated.can_create,
      can_edit: updated.can_edit,
      can_delete: updated.can_delete,
    });
    setSavingKey(null);

    if (error) {
      // Rull tilbake ved feil.
      setRows((m) => new Map(m).set(k, current));
      setMessage("Kunne ikke lagre endringen: " + error.message);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Ledere har alltid full tilgang. Juster hva <strong>selgere</strong> kan
        gjøre. Endringer lagres automatisk.
      </p>

      {(["agent", "manager"] as UserRole[]).map((role) => {
        const locked = role === "manager";
        return (
          <div key={role} className="card overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <h3 className="text-sm font-bold text-slate-700">
                {ROLE_LABELS[role]}
              </h3>
              {locked && (
                <span className="text-xs text-slate-400">
                  (full tilgang – kan ikke endres)
                </span>
              )}
            </div>
            <div className="overflow-x-auto thin-scroll">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-2 font-semibold">Ressurs</th>
                    {ACTIONS.map((a) => (
                      <th key={a} className="px-3 py-2 text-center font-semibold">
                        {ACTION_LABELS[a]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {RESOURCES.map((resource) => {
                    const row = rows.get(keyOf(role, resource))!;
                    return (
                      <tr key={resource}>
                        <td className="px-4 py-2.5 font-medium text-slate-700">
                          {RESOURCE_LABELS[resource]}
                        </td>
                        {ACTIONS.map((action) => {
                          const on = locked ? true : valueOf(row, action);
                          const busy = savingKey === `${keyOf(role, resource)}:${action}`;
                          return (
                            <td key={action} className="px-3 py-2.5 text-center">
                              <button
                                disabled={locked || busy}
                                onClick={() => toggle(role, resource, action)}
                                aria-pressed={on}
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition ${
                                  on
                                    ? "bg-brand-600 text-white"
                                    : "bg-slate-100 text-slate-300"
                                } ${locked ? "opacity-60" : "hover:opacity-80"}`}
                              >
                                {on && <Icon name="check" size={14} />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {message && <p className="text-sm text-red-600">{message}</p>}
      <p className="text-xs text-slate-400">
        Merk: «Kundekort» håndheves i databasen (RLS). Kontrakter, hendelser og
        produkter håndheves i appen inntil videre.
      </p>
    </div>
  );
}
