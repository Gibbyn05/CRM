"use client";

import { useState } from "react";
import type { ReachrCompany } from "@/lib/reachr";
import type { Emneknagg1881Company } from "@/lib/reachr/emneknagger";

type Row = Emneknagg1881Company & {
  status?: "idle" | "adding" | "added" | "error";
  msg?: string;
};

export default function Emneknagg1881View() {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  async function search(nextPage = 1, append = false) {
    if (!keyword.trim()) {
      setError("Skriv inn et søkeord (f.eks. elektriker, rørlegger, regnskap).");
      return;
    }
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const params = new URLSearchParams({
        keyword: keyword.trim(),
        location: location.trim(),
        page: String(nextPage),
      });
      const res = await fetch(`/api/reachr/emneknagger?${params}`);
      const data = (await res.json()) as {
        companies?: Emneknagg1881Company[];
        hasMore?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Søket feilet.");
      setRows((cur) =>
        append ? [...cur, ...(data.companies ?? [])] : data.companies ?? [],
      );
      setHasMore(Boolean(data.hasMore));
      setPage(nextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Søket feilet.");
    } finally {
      setLoading(false);
    }
  }

  async function addLead(row: Row, index: number) {
    setRows((r) => r.map((x, i) => (i === index ? { ...x, status: "adding" } : x)));
    try {
      // 1) Slå opp org.nr.
      const rres = await fetch(
        `/api/reachr/emneknagger/resolve?path=${encodeURIComponent(
          row.path,
        )}&name=${encodeURIComponent(row.name)}`,
      );
      const rjson = (await rres.json()) as { org_number?: string; error?: string };
      if (!rres.ok || !rjson.org_number) {
        throw new Error(rjson.error ?? "Fant ikke org.nr.");
      }
      // 2) Full bedriftsdata (Brreg + berikelse).
      const cres = await fetch(
        `/api/reachr/company?orgnr=${rjson.org_number}&deep=1`,
      );
      const cjson = (await cres.json()) as { company?: ReachrCompany };
      const company: ReachrCompany | null = cjson.company ?? null;
      if (!company) throw new Error("Fant ikke bedriften i registeret.");
      // Behold 1881-telefonen hvis registeret mangler.
      if (!company.phone && row.phone) company.phone = row.phone;
      // 3) Lagre som lead.
      const lres = await fetch("/api/reachr/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company }),
      });
      const ljson = (await lres.json().catch(() => ({}))) as { error?: string };
      if (!lres.ok) throw new Error(ljson.error ?? "Kunne ikke lagre lead.");
      setRows((r) =>
        r.map((x, i) => (i === index ? { ...x, status: "added" } : x)),
      );
    } catch (e) {
      setRows((r) =>
        r.map((x, i) =>
          i === index
            ? { ...x, status: "error", msg: e instanceof Error ? e.message : "Feil" }
            : x,
        ),
      );
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-[#d8c9b0] bg-[#fffaf0]/85 p-5 shadow-[0_28px_80px_rgba(43,33,24,0.08)]">
        <p className="max-w-2xl text-sm text-[#6f5a43]">
          Søk direkte i 1881 sine søkeord («emneknagger») og finn bedriftene som
          faktisk har registrert seg på tjenesten – altså aktive annonsører. Du
          får telefon med en gang, og «Legg til» henter org.nr og lagrer leadet.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1.2fr_1fr_auto]">
          <Field label="Søkeord (tjeneste)">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search(1, false)}
              placeholder="elektriker, rørlegger, regnskap ..."
              className="reachr-input"
            />
          </Field>
          <Field label="Sted (valgfritt)">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search(1, false)}
              placeholder="Oslo, Bergen ..."
              className="reachr-input"
            />
          </Field>
          <button
            type="button"
            onClick={() => search(1, false)}
            className="self-end rounded-2xl bg-[#09fe94] px-6 py-3 text-sm font-black text-[#171717] shadow-[0_18px_45px_rgba(9,254,148,0.22)] transition hover:brightness-95"
          >
            {loading ? "Søker ..." : "Søk 1881"}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {rows.length > 0 && (
        <section className="overflow-hidden rounded-[2rem] border border-[#d8c9b0] bg-[#fffaf0] shadow-sm">
          <div className="border-b border-[#d8c9b0] bg-[#f6ecd9] px-5 py-4">
            <p className="label-eyebrow">Aktive på 1881</p>
            <h2 className="font-display text-3xl font-black tracking-[-0.04em] text-[#2b2118]">
              {rows.length} bedrifter
            </h2>
          </div>
          <ul className="divide-y divide-[#eadcc5]">
            {rows.map((row, i) => (
              <li key={`${row.path}-${i}`} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-black leading-tight tracking-[-0.03em] text-[#2b2118]">
                    {row.name}
                  </p>
                  <p className="mt-0.5 text-sm text-[#6f5a43]">
                    {row.area ? `${row.area} · ` : ""}
                    <a
                      href={`https://www.1881.no${row.path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#0d7a4b] hover:underline"
                    >
                      Åpne på 1881
                    </a>
                  </p>
                </div>
                {row.phone ? (
                  <a
                    href={`tel:${row.phone}`}
                    className="rounded-full border border-[#09fe94]/40 bg-[#09fe94]/15 px-3 py-1.5 text-sm font-black text-[#24513b]"
                  >
                    {formatPhone(row.phone)}
                  </a>
                ) : (
                  <span className="rounded-full border border-[#d8c9b0] bg-[#fff8ea] px-3 py-1.5 text-xs font-black text-[#8b7357]">
                    Ingen tlf
                  </span>
                )}
                <button
                  type="button"
                  disabled={row.status === "adding" || row.status === "added"}
                  onClick={() => addLead(row, i)}
                  title={row.msg}
                  className="rounded-2xl border border-[#2b2118] px-4 py-2 text-sm font-black text-[#2b2118] transition hover:bg-[#2b2118] hover:text-[#fffaf0] disabled:border-[#d8c9b0] disabled:bg-[#efe1c7] disabled:text-[#8b7357]"
                >
                  {row.status === "adding"
                    ? "Legger til ..."
                    : row.status === "added"
                      ? "Lagt til"
                      : row.status === "error"
                        ? "Prøv igjen"
                        : "Legg til"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && searched && rows.length === 0 && !error && (
        <div className="rounded-[2rem] border border-dashed border-[#d8c9b0] bg-[#fffaf0]/70 p-10 text-center">
          <p className="font-display text-3xl font-black text-[#2b2118]">
            Ingen treff på 1881
          </p>
          <p className="mt-2 text-[#6f5a43]">
            Prøv et annet søkeord eller fjern stedet. Søkeordet må matche en
            registrert emneknagg på 1881 (f.eks. «elektriker», «rørlegger»,
            «regnskap»).
          </p>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => search(page + 1, true)}
            className="rounded-2xl border border-[#d8c9b0] bg-[#fffaf0] px-5 py-3 text-sm font-bold text-[#2b2118] hover:bg-[#efe1c7]"
          >
            Last flere
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">
        {label}
      </span>
      {children}
    </label>
  );
}

function formatPhone(phone: string): string {
  const n = phone.replace(/^\+47/, "");
  return "+47 " + n.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}
