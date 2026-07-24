"use client";

import { useEffect, useState } from "react";
import type { DailyReport } from "@/lib/types";
import { formatDate } from "@/lib/format";

// Henter/genererer dagsavisen for innlogget selger. Trigges automatisk når
// selgeren åpner siden (typisk hver morgen). Rapporten caches i databasen.
export default function DagsavisView() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dagsavis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Kunne ikke hente dagsavis");
      }
      const { report } = await res.json();
      setReport(report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="card flex items-center justify-center gap-3 p-10 text-center text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
        Genererer dagsavis …
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => load()}
          className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Prøv igjen
        </button>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Telefoner ringt" value={report.calls_count} />
        <Stat label="Bekreftede møter" value={report.meetings_confirmed} />
        <Stat label="Salg" value={report.sales_count} accent="text-green-600" />
        <Stat label="Avslag" value={report.rejections_count} accent="text-red-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-brand-50 to-white px-6 py-4">
          <div>
            <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
              AI-oppsummering
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              Dagsavis – {formatDate(report.report_date)}
            </h2>
          </div>
          <button
            onClick={() => load(true)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Regenerer
          </button>
        </div>
        <div className="prose prose-slate max-w-none whitespace-pre-wrap px-6 py-5 text-slate-700">
          {report.summary_text}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = "text-slate-900",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="card p-4">
      <p className={`text-3xl font-bold ${accent}`}>{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}
