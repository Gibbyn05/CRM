"use client";

import { useMemo, useState } from "react";
import type { ReachrCompany } from "@/lib/reachr";
import { INDUSTRY_FILTERS, formatMoney } from "@/lib/reachr";
import ReachrCompanyDrawer from "./ReachrCompanyDrawer";

type SearchResponse = {
  results: ReachrCompany[];
  total: number;
  page: number;
  has_more: boolean;
  error?: string;
};

const employeeOptions = [
  { label: "Alle ansatte", value: "all" },
  { label: "1 til 10", value: "1-10" },
  { label: "11 til 50", value: "11-50" },
  { label: "51 til 200", value: "51-200" },
  { label: "200+", value: "200+" },
];

const orgForms = [
  { label: "Alle selskapsformer", value: "" },
  { label: "AS", value: "AS" },
  { label: "ENK", value: "ENK" },
  { label: "NUF", value: "NUF" },
  { label: "ANS", value: "ANS" },
  { label: "DA", value: "DA" },
];

export default function LeadSearchView() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [industry, setIndustry] = useState("");
  const [nace, setNace] = useState("B2B");
  const [employees, setEmployees] = useState("all");
  const [orgForm, setOrgForm] = useState("");
  const [mva, setMva] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [hasWebsite, setHasWebsite] = useState(false);
  const [minRevenue, setMinRevenue] = useState("");
  const [maxRevenue, setMaxRevenue] = useState("");
  const [minResult, setMinResult] = useState("");
  const [results, setResults] = useState<ReachrCompany[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ReachrCompany | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeFilters = useMemo(
    () =>
      [nace && nace !== "B2B", employees !== "all", orgForm, mva, hasEmail, hasWebsite, minRevenue, maxRevenue, minResult]
        .filter(Boolean).length,
    [employees, hasEmail, hasWebsite, maxRevenue, minResult, minRevenue, mva, nace, orgForm],
  );

  async function search(nextPage = 0, append = false) {
    if (!query.trim() && !location.trim() && !industry.trim() && !nace) {
      setError("Skriv inn firmanavn, sted eller velg en bransje.");
      return;
    }
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      q: query,
      location,
      industry,
      nace,
      employees,
      orgForm,
      page: String(nextPage),
      size: "50",
    });
    if (mva) params.set("mva", "true");
    if (hasEmail) params.set("hasEmail", "true");
    if (hasWebsite) params.set("hasWebsite", "true");
    if (minRevenue) params.set("minRevenue", minRevenue);
    if (maxRevenue) params.set("maxRevenue", maxRevenue);
    if (minResult) params.set("minResult", minResult);

    try {
      const res = await fetch(`/api/reachr/search?${params}`);
      const data = (await res.json()) as SearchResponse;
      if (!res.ok) throw new Error(data.error ?? "Søket feilet.");
      setResults((current) => (append ? [...current, ...data.results] : data.results));
      setTotal(data.total);
      setHasMore(data.has_more);
      setPage(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Søket feilet.");
    } finally {
      setLoading(false);
    }
  }

  async function addLead(company: ReachrCompany) {
    const enriched = await fetch(`/api/reachr/company?orgnr=${company.org_number}`)
      .then((res) => res.json())
      .then((data: { company?: ReachrCompany }) => data.company ?? company)
      .catch(() => company);

    const res = await fetch("/api/reachr/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: enriched }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Kunne ikke lagre lead.");
    setAdded((current) => new Set([...current, company.org_number]));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-[#d8c9b0] bg-[#fffaf0]/85 p-5 shadow-[0_28px_80px_rgba(43,33,24,0.08)]">
        <div className="grid gap-3 lg:grid-cols-[1.15fr_0.9fr_0.8fr_auto]">
          <Field label="Firmanavn eller søkeord">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="F.eks. regnskap, alarm, software" className="reachr-input" />
          </Field>
          <Field label="Sted i Norge">
            <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Oslo, Bergen, Molde ..." className="reachr-input" />
          </Field>
          <Field label="Bransje">
            <input value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="Frisør, bygg, IT ..." className="reachr-input" />
          </Field>
          <button type="button" onClick={() => search(0, false)} className="self-end rounded-2xl bg-[#09fe94] px-6 py-3 text-sm font-black text-[#171717] shadow-[0_18px_45px_rgba(9,254,148,0.22)] transition hover:brightness-95">
            {loading ? "Søker ..." : "Søk"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Bransjekode">
            <select value={nace} onChange={(event) => setNace(event.target.value)} className="reachr-input">
              {INDUSTRY_FILTERS.map((item) => (
                <option key={item.code || "all"} value={item.code}>{item.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Ansatte">
            <select value={employees} onChange={(event) => setEmployees(event.target.value)} className="reachr-input">
              {employeeOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Selskapsform">
            <select value={orgForm} onChange={(event) => setOrgForm(event.target.value)} className="reachr-input">
              {orgForms.map((item) => (
                <option key={item.value || "all"} value={item.value}>{item.label}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-2 pt-6">
            <Toggle label="MVA" checked={mva} onChange={setMva} />
            <Toggle label="E-post" checked={hasEmail} onChange={setHasEmail} />
            <Toggle label="Nettside" checked={hasWebsite} onChange={setHasWebsite} />
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="Min. omsetning">
            <input value={minRevenue} onChange={(event) => setMinRevenue(event.target.value)} inputMode="numeric" placeholder="1000000" className="reachr-input" />
          </Field>
          <Field label="Maks omsetning">
            <input value={maxRevenue} onChange={(event) => setMaxRevenue(event.target.value)} inputMode="numeric" placeholder="50000000" className="reachr-input" />
          </Field>
          <Field label="Min. resultat">
            <input value={minResult} onChange={(event) => setMinResult(event.target.value)} inputMode="numeric" placeholder="0" className="reachr-input" />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#6f5a43]">
          <span>{activeFilters} aktive filtre · søker i hele Norge når sted står tomt</span>
          {total > 0 && <span>{results.length} vist av ca. {total.toLocaleString("nb-NO")}</span>}
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      <section className="grid gap-4 xl:grid-cols-2">
        {results.map((company) => (
          <article key={company.org_number} className="group rounded-[1.75rem] border border-[#d8c9b0] bg-[#fffaf0] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_22px_60px_rgba(43,33,24,0.10)]">
            <div className="flex items-start justify-between gap-4">
              <button type="button" onClick={() => setSelected(company)} className="min-w-0 text-left">
                <p className="font-display text-2xl font-black leading-tight tracking-[-0.03em] text-[#2b2118] group-hover:underline group-hover:decoration-[#09fe94] group-hover:decoration-4 group-hover:underline-offset-4">
                  {company.name}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b7357]">
                  {company.org_number} · {company.address.city ?? "Norge"}
                </p>
              </button>
              <button
                type="button"
                disabled={added.has(company.org_number)}
                onClick={() => addLead(company)}
                className="shrink-0 rounded-2xl border border-[#2b2118] px-4 py-2 text-sm font-black text-[#2b2118] transition hover:bg-[#2b2118] hover:text-[#fffaf0] disabled:border-[#d8c9b0] disabled:bg-[#efe1c7] disabled:text-[#8b7357]"
              >
                {added.has(company.org_number) ? "Lagt til" : "Legg til"}
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Mini label="Ansatte" value={company.employees?.toString() ?? "Ukjent"} />
              <Mini label="Bransje" value={company.industry_code ?? "Ukjent"} />
              <Mini label="Omsetning" value={company.financials?.revenue != null ? formatMoney(company.financials.revenue) : "Filterdata"} />
              <Mini label="Kontakt" value={[company.phone && "Tlf", company.email && "Mail", company.website && "Web"].filter(Boolean).join(" · ") || "Ikke funnet"} />
            </div>
            <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-[#6f5a43]">
              {company.industry ?? "Bransje ikke oppgitt"} {company.purpose ? `· ${company.purpose}` : ""}
            </p>
          </article>
        ))}
      </section>

      {!loading && results.length === 0 && (
        <div className="rounded-[2rem] border border-dashed border-[#d8c9b0] bg-[#fffaf0]/70 p-10 text-center">
          <p className="font-display text-3xl font-black text-[#2b2118]">Start et leadssøk</p>
          <p className="mt-2 text-[#6f5a43]">Velg B2B, sted eller bransje og hent bedrifter fra offentlige registre.</p>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <button type="button" onClick={() => search(page + 1, true)} className="rounded-2xl border border-[#d8c9b0] bg-[#fffaf0] px-5 py-3 text-sm font-bold text-[#2b2118] hover:bg-[#efe1c7]">
            Last flere
          </button>
        </div>
      )}

      {selected && (
        <ReachrCompanyDrawer
          open
          company={selected}
          alreadyAdded={added.has(selected.org_number)}
          onClose={() => setSelected(null)}
          onAdd={addLead}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-2xl border px-3 py-3 text-xs font-black transition ${checked ? "border-[#09fe94]/40 bg-[#09fe94]/20 text-[#24513b]" : "border-[#d8c9b0] bg-[#fffaf0] text-[#8b7357] hover:bg-[#efe1c7]"}`}
    >
      {label}
    </button>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e4d3b8] bg-[#f6ecd9] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8b7357]">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-[#2b2118]">{value}</p>
    </div>
  );
}
