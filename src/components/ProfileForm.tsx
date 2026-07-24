"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import Avatar from "./Avatar";

// Rediger egen profil: navn, telefon og profilbilde. Profilbilde lastes opp til
// Supabase Storage (bucket "avatars") og lagres som public URL på profilen.
export default function ProfileForm({ profile }: { profile: Profile }) {
  const supabase = createClient();
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);

    const ext = file.name.split(".").pop() ?? "png";
    // Unik sti per bruker + tidsstempel (cache-busting).
    const path = `${profile.id}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (upErr) {
      setUploading(false);
      setMessage({
        type: "err",
        text:
          "Kunne ikke laste opp bildet. Er 'avatars'-bucketen opprettet i Supabase? (Kjør migrasjon 0005.) Du kan også lime inn en bilde-URL under.",
      });
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploading(false);
    setMessage({ type: "ok", text: "Bilde lastet opp. Husk å lagre." });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      })
      .eq("id", profile.id);
    setSaving(false);

    if (error) {
      setMessage({ type: "err", text: error.message });
      return;
    }
    setMessage({ type: "ok", text: "Profil lagret." });
    router.refresh();
  }

  return (
    <div className="card max-w-lg space-y-5 p-6">
      {/* Profilbilde */}
      <div className="flex items-center gap-4">
        <Avatar name={fullName || profile.email} url={avatarUrl} size={72} />
        <div>
          <label className="inline-block cursor-pointer rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            {uploading ? "Laster opp …" : "Last opp bilde"}
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <p className="mt-1 text-xs text-slate-400">PNG eller JPG</p>
        </div>
      </div>

      {/* Navn */}
      <Field label="Navn">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </Field>

      {/* Telefon */}
      <Field label="Telefon">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </Field>

      {/* Bilde-URL (alternativ til opplasting) */}
      <Field label="Bilde-URL (valgfritt alternativ)">
        <input
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </Field>

      {/* E-post (skrivebeskyttet) */}
      <Field label="E-post">
        <input
          value={profile.email}
          disabled
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500"
        />
      </Field>

      {message && (
        <p
          className={`text-sm ${
            message.type === "ok" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {saving ? "Lagrer …" : "Lagre profil"}
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">
        {label}
      </label>
      {children}
    </div>
  );
}
