"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, RolePermission, UserInvitation, UserRole } from "@/lib/types";
import Avatar from "./Avatar";
import Icon from "./Icon";
import PermissionMatrix from "./PermissionMatrix";

type Tab = "brukere" | "tilgang";

function formatInviteDate(value: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function UsersAdmin({
  currentUserId,
  initialProfiles,
  initialPermissions,
  initialInvitations,
}: {
  currentUserId: string;
  initialProfiles: Profile[];
  initialPermissions: RolePermission[];
  initialInvitations: UserInvitation[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("brukere");
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);
  const [invitations, setInvitations] = useState<UserInvitation[]>(initialInvitations);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [songProfile, setSongProfile] = useState<Profile | null>(null);

  useEffect(() => setProfiles(initialProfiles), [initialProfiles]);
  useEffect(() => setInvitations(initialInvitations), [initialInvitations]);

  async function invitationAction(invitation: UserInvitation, action: "resend" | "revoke") {
    setBusyId(invitation.id);
    try {
      const response = await fetch(`/api/users/invitations/${invitation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Kunne ikke oppdatere invitasjonen.");
      if (action === "revoke") {
        setInvitations((items) => items.filter((item) => item.id !== invitation.id));
      } else {
        setInvitations((items) => items.map((item) => item.id === invitation.id ? result.invitation : item));
      }
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Ukjent feil.");
    } finally {
      setBusyId(null);
    }
  }

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
              Legg til medlem
            </button>
          </div>

          {invitations.length > 0 && (
            <div className="card divide-y divide-slate-100 p-0">
              <div className="px-4 py-3">
                <h2 className="font-semibold text-slate-800">Ventende invitasjoner</h2>
                <p className="text-sm text-slate-500">Brukere som ennå ikke har aktivert kontoen sin.</p>
              </div>
              {invitations.map((invitation) => {
                const expired = invitation.status === "expired" || new Date(invitation.expires_at) <= new Date();
                return (
                  <div key={invitation.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 font-bold text-amber-700">{invitation.full_name.slice(0, 1).toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-semibold text-slate-800"><span className="truncate">{invitation.full_name}</span><span className={`rounded px-1.5 py-0.5 text-3xs font-medium ${expired ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{expired ? "Utløpt" : "Invitert"}</span></p>
                      <p className="truncate text-sm text-slate-500">{invitation.email}</p>
                      <p className="mt-1 text-xs text-slate-400">Sendt {invitation.sent_at ? formatInviteDate(invitation.sent_at) : "ikke sendt"} · Utløper {formatInviteDate(invitation.expires_at)}</p>
                      {invitation.email_error && <p className="mt-1 text-xs text-red-600">E-postsending feilet. Send invitasjonen på nytt.</p>}
                    </div>
                    <span className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600">{invitation.role === "manager" ? "Leder" : "Selger"}</span>
                    <button disabled={busyId === invitation.id} onClick={() => invitationAction(invitation, "resend")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Send på nytt</button>
                    <button disabled={busyId === invitation.id} onClick={() => invitationAction(invitation, "revoke")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Trekk tilbake</button>
                  </div>
                );
              })}
            </div>
          )}

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

                  {/* Salgssang (spilles på TV ved salg) */}
                  <button
                    onClick={() => setSongProfile(p)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                      p.sale_song_url
                        ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
                        : "border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                    title="Salgssang som spilles på TV-visningen"
                  >
                    🎵 {p.sale_song_url ? "Endre sang" : "Sang"}
                  </button>

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
        <InviteUserModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            router.refresh();
          }}
        />
      )}

      {songProfile && (
        <SongModal
          profile={songProfile}
          onClose={() => setSongProfile(null)}
          onSaved={(patch) => {
            setProfiles((list) =>
              list.map((x) =>
                x.id === songProfile.id ? { ...x, ...patch } : x,
              ),
            );
            setSongProfile(null);
          }}
        />
      )}
    </div>
  );
}

type SongPatch = {
  sale_song_url: string | null;
  sale_song_start_seconds: number;
  sale_song_duration_seconds: number | null;
};

// Velg salgssang for en selger: last opp / lim inn URL, og velg hvor i sangen
// den starter (start) og hvor lenge den spiller (varighet).
function SongModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (patch: SongPatch) => void;
}) {
  const supabase = createClient();
  const [url, setUrl] = useState(profile.sale_song_url ?? "");
  const [start, setStart] = useState(String(profile.sale_song_start_seconds ?? 0));
  const [duration, setDuration] = useState(
    profile.sale_song_duration_seconds != null
      ? String(profile.sale_song_duration_seconds)
      : "",
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const ext = file.name.split(".").pop() ?? "mp3";
    const path = `${profile.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("sale-songs")
      .upload(path, file, { upsert: true });
    if (upErr) {
      setUploading(false);
      setError(
        "Kunne ikke laste opp lyd. Er «sale-songs»-bucketen opprettet? (Kjør migrasjon 0023.) Du kan også lime inn en URL.",
      );
      return;
    }
    const { data } = supabase.storage.from("sale-songs").getPublicUrl(path);
    setUrl(data.publicUrl);
    setUploading(false);
  }

  function useCurrentAsStart() {
    const a = audioRef.current;
    if (a) setStart(String(Math.floor(a.currentTime)));
  }

  // Forhåndslytt klippet: spill fra start i «varighet» sekunder.
  function previewClip() {
    const a = audioRef.current;
    if (!a) return;
    const s = Number(start) || 0;
    const d = duration ? Number(duration) : null;
    a.currentTime = s;
    a.play().catch(() => {});
    if (d && d > 0) {
      const stopAt = s + d;
      const onTime = () => {
        if (a.currentTime >= stopAt) {
          a.pause();
          a.removeEventListener("timeupdate", onTime);
        }
      };
      a.addEventListener("timeupdate", onTime);
    }
  }

  async function save(value: string | null) {
    setSaving(true);
    setError(null);
    const patch: SongPatch = {
      sale_song_url: value,
      sale_song_start_seconds: Math.max(0, Number(start) || 0),
      sale_song_duration_seconds:
        value && duration ? Math.max(1, Number(duration)) : null,
    };
    const { error: err } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", profile.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved(patch);
  }

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="animate-panel-in max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl thin-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            Salgssang – {profile.full_name || profile.email}
          </h2>
          <button
            onClick={onClose}
            aria-label="Lukk"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <p className="mb-3 text-sm text-slate-500">
          Spilles av på TV-visningen når selgeren får et salg.
        </p>

        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
          <Icon name="upload" size={16} />
          {uploading ? "Laster opp …" : "Last opp lydfil (mp3)"}
          <input
            type="file"
            accept="audio/*"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>

        <div className="my-3 text-center text-xs text-slate-400">eller</div>

        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Lim inn lyd-URL (https://…mp3)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />

        {url && (
          <audio ref={audioRef} controls src={url} className="mt-3 w-full">
            Nettleseren støtter ikke lydavspilling.
          </audio>
        )}

        {/* Start + varighet */}
        {url && (
          <div className="mt-4 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-slate-500">
                Start (sekunder)
                <input
                  type="number"
                  min={0}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <label className="text-xs font-medium text-slate-500">
                Varighet (sekunder)
                <input
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="hele sangen"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={useCurrentAsStart}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Sett start = spillerens tid
              </button>
              <button
                onClick={previewClip}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
              >
                ▶ Forhåndslytt klipp
              </button>
            </div>
            <p className="text-2xs text-slate-400">
              La «Varighet» stå tom for å spille ut sangen. Bruk avspilleren over
              til å finne startpunktet, og trykk «Sett start = spillerens tid».
            </p>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={() => save(null)}
            disabled={saving || !profile.sale_song_url}
            className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            Fjern sang
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              Avbryt
            </button>
            <button
              onClick={() => save(url.trim() || null)}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Lagrer …" : "Lagre"}
            </button>
          </div>
        </div>
      </div>
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

function InviteUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    email: "",
    role: "agent" as UserRole,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Kunne ikke sende invitasjonen.");
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
        <h2 className="mb-1 text-lg font-bold text-slate-900">Legg til medlem</h2>
        <p className="mb-4 text-sm text-slate-500">Velg rolle og e-post. Medlemmet fyller selv inn navn og profilbilde når kontoen aktiveres.</p>
        <div className="space-y-3">
          <input
            autoFocus
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="E-post"
            className={inputCls}
          />
          <label className="block text-sm font-medium text-slate-600">
            Rolle
            <select
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value as UserRole }))
              }
              className={`mt-1 ${inputCls}`}
            >
              <option value="agent">Selger</option>
              <option value="manager">Leder</option>
            </select>
          </label>
          <p className="text-xs text-slate-400">Invitasjonen er gyldig i 72 timer og kan bare brukes én gang.</p>
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
            {saving ? "Sender …" : "Send invitasjon"}
          </button>
        </div>
      </div>
    </div>
  );
}
