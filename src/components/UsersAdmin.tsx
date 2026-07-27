"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, RolePermission, UserRole } from "@/lib/types";
import Avatar from "./Avatar";
import Icon from "./Icon";
import PermissionMatrix from "./PermissionMatrix";

type Tab = "brukere" | "tilgang";

export default function UsersAdmin({
  currentUserId,
  initialProfiles,
  initialPermissions,
}: {
  currentUserId: string;
  initialProfiles: Profile[];
  initialPermissions: RolePermission[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("brukere");
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setRole(p: Profile, role: UserRole) {
    setBusyId(p.id);
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", p.id);
    setBusyId(null);
    if (!error) {
      setProfiles((list) =>
        list.map((x) => (x.id === p.id ? { ...x, role } : x)),
      );
    }
  }

  async function setActive(p: Profile, is_active: boolean) {
    setBusyId(p.id);
    const { error } = await supabase
      .from("profiles")
      .update({ is_active })
      .eq("id", p.id);
    setBusyId(null);
    if (!error) {
      setProfiles((list) =>
        list.map((x) => (x.id === p.id ? { ...x, is_active } : x)),
      );
    }
  }

  return (
    <div className="space-y-4">
      {/* Faner */}
      <div className="flex gap-1 rounded-xl bg-white p-1 shadow-card ring-1 ring-slate-200/70">
        <TabButton active={tab === "brukere"} onClick={() => setTab("brukere")}>
          Brukere
        </TabButton>
        <TabButton active={tab === "tilgang"} onClick={() => setTab("tilgang")}>
          Tilgangsstyring
        </TabButton>
      </div>

      {tab === "brukere" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Icon name="plus" size={16} />
              Ny bruker
            </button>
          </div>

          <div className="card divide-y divide-slate-100 p-0">
            {profiles.map((p) => {
              const isSelf = p.id === currentUserId;
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 p-4"
                >
                  <Avatar
                    name={p.full_name || p.email}
                    url={p.avatar_url}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold text-slate-800">
                      <span className="truncate">{p.full_name || "—"}</span>
                      {!p.is_active && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-medium text-slate-500">
                          Deaktivert
                        </span>
                      )}
                      {isSelf && (
                        <span className="rounded bg-brand-50 px-1.5 py-0.5 text-3xs font-medium text-brand-600">
                          Deg
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-slate-400">{p.email}</p>
                  </div>

                  {/* Rolle */}
                  <select
                    value={p.role}
                    disabled={isSelf || busyId === p.id}
                    onChange={(e) => setRole(p, e.target.value as UserRole)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm disabled:opacity-50"
                    title={isSelf ? "Du kan ikke endre din egen rolle" : undefined}
                  >
                    <option value="agent">Selger</option>
                    <option value="manager">Leder</option>
                  </select>

                  {/* Aktiv/deaktiver */}
                  {p.is_active ? (
                    <button
                      onClick={() => setActive(p, false)}
                      disabled={isSelf || busyId === p.id}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                      title={isSelf ? "Du kan ikke deaktivere deg selv" : undefined}
                    >
                      Deaktiver
                    </button>
                  ) : (
                    <button
                      onClick={() => setActive(p, true)}
                      disabled={busyId === p.id}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                    >
                      Aktiver
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "tilgang" && (
        <PermissionMatrix initialPermissions={initialPermissions} />
      )}

      {createOpen && (
        <CreateUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-brand-50 text-brand-700"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "agent" as UserRole,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let p = "";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 12; i++) p += chars[arr[i] % chars.length];
    setForm((f) => ({ ...f, password: p }));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Kunne ikke opprette bruker.");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukjent feil.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="animate-panel-in w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold text-slate-900">Ny bruker</h2>
        <div className="space-y-3">
          <input
            autoFocus
            value={form.full_name}
            onChange={(e) =>
              setForm((f) => ({ ...f, full_name: e.target.value }))
            }
            placeholder="Fullt navn"
            className={inputCls}
          />
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="E-post"
            className={inputCls}
          />
          <div className="flex gap-2">
            <input
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
              placeholder="Passord (min. 8 tegn)"
              className={inputCls}
            />
            <button
              type="button"
              onClick={generatePassword}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              Generer
            </button>
          </div>
          <select
            value={form.role}
            onChange={(e) =>
              setForm((f) => ({ ...f, role: e.target.value as UserRole }))
            }
            className={inputCls}
          >
            <option value="agent">Selger</option>
            <option value="manager">Leder</option>
          </select>
          <p className="text-xs text-slate-400">
            Del e-post og passord med brukeren manuelt. De kan endre passordet
            senere.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Avbryt
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Oppretter …" : "Opprett bruker"}
          </button>
        </div>
      </div>
    </div>
  );
}
