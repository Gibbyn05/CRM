"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CustomerFile } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import Icon from "./Icon";

const BUCKET = "customer-files";

function prettySize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// «Filer»: last opp dokumenter knyttet til kunden. Privat bucket – nedlasting
// skjer via signert URL.
export default function CustomerFiles({
  customerId,
  initialFiles,
  nameMap,
}: {
  customerId: string;
  initialFiles: CustomerFile[];
  nameMap: Record<string, string>;
}) {
  const supabase = createClient();
  const [files, setFiles] = useState<CustomerFile[]>(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`customer-files:${customerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_files" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const file = payload.new as CustomerFile;
            if (file.customer_id !== customerId) return;
            setFiles((current) =>
              current.some((item) => item.id === file.id)
                ? current
                : [file, ...current],
            );
          } else if (payload.eventType === "UPDATE") {
            const file = payload.new as CustomerFile;
            if (file.customer_id !== customerId) return;
            setFiles((current) =>
              current.map((item) => (item.id === file.id ? file : item)),
            );
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as Pick<CustomerFile, "id">;
            setFiles((current) => current.filter((item) => item.id !== deleted.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customerId, supabase]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${customerId}/${Date.now()}-${safeName}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false });
    if (upErr) {
      setUploading(false);
      setError(
        "Kunne ikke laste opp. Er «customer-files»-bucketen opprettet? (Kjør migrasjon 0025.)",
      );
      return;
    }

    const { data, error: insErr } = await supabase
      .from("customer_files")
      .insert({
        customer_id: customerId,
        name: file.name,
        path,
        size: file.size,
        mime: file.type || null,
        uploaded_by: user?.id ?? null,
      })
      .select("*")
      .single();

    setUploading(false);
    e.target.value = "";
    if (insErr || !data) {
      setError(insErr?.message ?? "Kunne ikke lagre fila.");
      return;
    }
    setFiles((prev) => [data as CustomerFile, ...prev]);
  }

  async function download(f: CustomerFile) {
    const { data, error: err } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(f.path, 60);
    if (err || !data) {
      setError("Kunne ikke åpne fila.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function remove(f: CustomerFile) {
    if (!confirm(`Slette «${f.name}»?`)) return;
    await supabase.storage.from(BUCKET).remove([f.path]);
    await supabase.from("customer_files").delete().eq("id", f.id);
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Filer</h2>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          <Icon name="upload" size={16} />
          {uploading ? "Laster opp …" : "Last opp fil"}
          <input
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {files.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
          Ingen filer ennå. Last opp dokumenter, kontrakter eller bilder knyttet
          til kunden.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <Icon name="box" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => download(f)}
                  className="block max-w-full truncate text-left text-sm font-medium text-brand-600 hover:underline"
                >
                  {f.name}
                </button>
                <p className="text-2xs text-slate-400">
                  {prettySize(f.size)}
                  {f.size ? " · " : ""}
                  {formatDateTime(f.created_at)}
                  {f.uploaded_by && nameMap[f.uploaded_by]
                    ? ` · ${nameMap[f.uploaded_by]}`
                    : ""}
                </p>
              </div>
              <button
                onClick={() => download(f)}
                aria-label="Last ned"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <Icon name="upload" size={16} className="rotate-180" />
              </button>
              <button
                onClick={() => remove(f)}
                aria-label="Slett"
                className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
