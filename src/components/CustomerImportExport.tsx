"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  CUSTOMER_IMPORT_FIELDS,
  buildCustomerImportPreview,
  suggestCustomerImportMapping,
  toImportedTable,
  type CustomerImportField,
  type CustomerImportMapping,
} from "@/lib/customer-import";
import Icon from "./Icon";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 2_000;

type SourceTable = { headers: string[]; rows: string[][]; fileName: string };

export default function CustomerImportExport({ onImported }: { onImported: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<SourceTable | null>(null);
  const [mapping, setMapping] = useState<CustomerImportMapping>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const preview = useMemo(
    () => (source ? buildCustomerImportPreview(source.rows, mapping) : null),
    [mapping, source],
  );
  const hasNameColumn = mapping.name !== undefined && mapping.name >= 0;

  function reset() {
    setOpen(false);
    setSource(null);
    setMapping({});
    setError(null);
    setResult(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "csv" && extension !== "tsv") {
      setError("Bruk en CSV- eller TSV-fil. Velg «CSV» ved eksport fra det gamle systemet.");
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      setError("Filen må være mellom 1 byte og 5 MB.");
      return;
    }
    try {
      const table = toImportedTable(await file.text());
      if (table.headers.length === 0 || table.rows.length === 0) {
        throw new Error("Filen inneholder ingen kundelinjer.");
      }
      if (table.rows.length > MAX_ROWS) {
        throw new Error(`Importer maksimalt ${MAX_ROWS.toLocaleString("nb-NO")} kunder om gangen.`);
      }
      setSource({ ...table, fileName: file.name });
      setMapping(suggestCustomerImportMapping(table.headers));
      setError(null);
      setResult(null);
      setOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lese filen.");
    }
  }

  function setColumn(field: CustomerImportField, index: number) {
    setMapping((current) => {
      const next = { ...current, [field]: index };
      if (index >= 0) {
        CUSTOMER_IMPORT_FIELDS.forEach((candidate) => {
          if (candidate.key !== field && next[candidate.key] === index) delete next[candidate.key];
        });
      } else {
        delete next[field];
      }
      return next;
    });
  }

  async function importCustomers() {
    if (!preview || !hasNameColumn || preview.rows.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const response = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview.rows }),
      });
      const body = (await response.json()) as {
        error?: string;
        created?: number;
        skipped_existing?: number;
        rejected?: { row: number; message: string }[];
      };
      if (!response.ok) {
        const detail = body.rejected?.length
          ? ` ${body.rejected.length} linjer ble avvist.`
          : "";
        throw new Error(`${body.error ?? "Kunne ikke importere kundene."}${detail}`);
      }
      const skipped = body.skipped_existing ?? 0;
      setResult(
        `${body.created ?? 0} kunder ble importert.${skipped ? ` ${skipped} med eksisterende org.nr ble hoppet over.` : ""}`,
      );
      onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke importere kundene.");
    } finally {
      setImporting(false);
    }
  }

  async function exportCustomers() {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/customers/export", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Kunne ikke eksportere kundene.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "media-norge-kunder.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke eksportere kundene.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-[#bda98b] hover:bg-[#fbf7ed]"
      >
        <Icon name="upload" size={17} />
        Importer
      </button>
      <button
        type="button"
        onClick={exportCustomers}
        disabled={exporting}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-[#bda98b] hover:bg-[#fbf7ed] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon name="download" size={17} />
        {exporting ? "Eksporterer …" : "Eksporter"}
      </button>
      {error && !open && <p className="w-full text-sm text-red-600">{error}</p>}

      {open && source && preview && (
        <div className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="animate-panel-in max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-pop thin-scroll sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Importer kunder</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {source.fileName} · {source.rows.length.toLocaleString("nb-NO")} kundelinjer
                </p>
              </div>
              <button type="button" onClick={reset} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Lukk import">
                <Icon name="close" size={20} />
              </button>
            </div>

            {result ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-bold text-emerald-800">Import ferdig</p>
                <p className="mt-1 text-sm text-emerald-800">{result}</p>
                <button type="button" onClick={reset} className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">
                  Ferdig
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="font-bold">Kontroller feltene før import</p>
                  <p className="mt-1">Ingen eksisterende kundekort overskrives. Rader med samme org.nr som en kunde i CRM-et blir hoppet over. Rader uten org.nr opprettes som nye kunder.</p>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {CUSTOMER_IMPORT_FIELDS.map((field) => (
                    <label key={field.key} className="block text-sm font-medium text-slate-700">
                      {field.label}{field.required ? " *" : ""}
                      <select
                        value={mapping[field.key] ?? -1}
                        onChange={(event) => setColumn(field.key, Number(event.target.value))}
                        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      >
                        <option value={-1}>{field.required ? "Velg kolonne" : "Ikke importer"}</option>
                        {source.headers.map((header, index) => (
                          <option key={`${header}-${index}`} value={index}>{header}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                {!hasNameColumn && <p className="mt-3 text-sm font-medium text-red-600">Velg hvilken kolonne som inneholder kundenavn.</p>}
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-2xl font-bold text-slate-900">{preview.rows.length}</p>
                    <p className="text-sm text-slate-600">klare til import</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-2xl font-bold text-slate-900">{preview.issues.length}</p>
                    <p className="text-sm text-slate-600">linjer som blir utelatt</p>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Navn</th>
                        <th className="px-3 py-2">Org.nr</th>
                        <th className="px-3 py-2">Kontakt</th>
                        <th className="px-3 py-2">E-post</th>
                        <th className="px-3 py-2">Telefon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.slice(0, 5).map((row, index) => (
                        <tr key={`${row.name}-${index}`}>
                          <td className="px-3 py-2 text-slate-900">{row.name}</td>
                          <td className="px-3 py-2 text-slate-600">{row.org_number ?? "–"}</td>
                          <td className="px-3 py-2 text-slate-600">{row.contact_name ?? "–"}</td>
                          <td className="px-3 py-2 text-slate-600">{row.email ?? "–"}</td>
                          <td className="px-3 py-2 text-slate-600">{row.phone ?? "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {preview.issues.length > 0 && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    <p className="font-bold">Linjer som ikke importeres</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {preview.issues.slice(0, 8).map((issue) => <li key={`${issue.row}-${issue.message}`}>Linje {issue.row}: {issue.message}</li>)}
                      {preview.issues.length > 8 && <li>og {preview.issues.length - 8} til.</li>}
                    </ul>
                  </div>
                )}
                {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={reset} disabled={importing} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                    Avbryt
                  </button>
                  <button type="button" onClick={importCustomers} disabled={importing || !hasNameColumn || preview.rows.length === 0} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {importing ? "Importerer …" : `Importer ${preview.rows.length.toLocaleString("nb-NO")} kunder`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
