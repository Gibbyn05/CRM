"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    search(0, false);
    // Last standardlisten én gang når fanen åpnes. Standardfilteret er B2B.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setResults((current) => {
        const next = append ? [...current, ...data.results] : data.results;
        const seen = new Set<string>();
        return next.filter((company) => {
          if (seen.has(company.org_number)) return false;
          seen.add(company.org_number);
          return true;
        });
      });
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
    setResults((current) => current.filter((item) => item.org_number !== company.org_number));
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
          <span>{activeFilters} aktive filtre · standardlisten viser B2B-bedrifter som ikke er tatt av noen</span>
          {total > 0 && <span>{results.length} vist av ca. {total.toLocaleString("nb-NO")}</span>}
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      <section className="overflow-hidden rounded-[2rem] border border-[#d8c9b0] bg-[#fffaf0] shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-[#d8c9b0] bg-[#f6ecd9] px-5 py-4">
          <div>
            <p className="label-eyebrow">Bedrifter tilgjengelig</p>
            <h2 className="font-display text-3xl font-black tracking-[-0.04em] text-[#2b2118]">
              {loading && results.length === 0 ? "Laster bedrifter ..." : `${results.length} bedrifter`}
            </h2>
          </div>
          <p className="hidden max-w-md text-right text-sm text-[#6f5a43] md:block">
            Bedrifter som finnes i Mine leads eller Kunder er filtrert bort globalt.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e4d3b8] text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">
                <th className="px-5 py-3">Bedrift</th>
                <th className="px-5 py-3">Sted</th>
                <th className="px-5 py-3">Bransje</th>
                <th className="px-5 py-3">Ansatte</th>
                <th className="px-5 py-3">Kontakt</th>
                <th className="px-5 py-3">Økonomi</th>
                <th className="px-5 py-3">Kilder</th>
                <th className="px-5 py-3 text-right">Handling</th>
              </tr>
            </thead>
            <tbody>
              {results.map((company) => (
                <tr
                  key={company.org_number}
                  onClick={() => setSelected(company)}
                  className="cursor-pointer border-b border-[#eadcc5] transition hover:bg-[#f7ffe9]"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelected(company);
                  }}
                >
                  <td className="px-5 py-4">
                    <p className="font-display text-xl font-black leading-tight tracking-[-0.03em] text-[#2b2118]">
                      {company.name}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b7357]">
                      Org.nr. {company.org_number}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-[#2b2118]">{company.address.city ?? "Norge"}</td>
                  <td className="max-w-xs px-5 py-4 text-sm text-[#6f5a43]">
                    <span className="font-semibold text-[#2b2118]">{company.industry_code ?? "—"}</span>
                    {company.industry ? ` · ${company.industry}` : ""}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-[#2b2118]">{company.employees ?? "Ukjent"}</td>
                  <td className="px-5 py-4 text-sm text-[#6f5a43]">
                    {[company.phone && "Tlf", company.email && "Mail", company.website && "Web"].filter(Boolean).join(" · ") || "Ikke funnet"}
                  </td>
                  <td className="px-5 py-4 text-sm text-[#6f5a43]">
                    {company.financials?.revenue != null ? formatMoney(company.financials.revenue) : "Åpne for detaljer"}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(company.data_sources?.length ? company.data_sources : [{ label: "Brreg", status: "active" as const }]).slice(0, 3).map((source) => (
                        <span
                          key={`${company.org_number}-${source.label}`}
                          className="rounded-full border border-[#d8c9b0] bg-[#fff8ea] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#8b7357]"
                        >
                          {source.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      disabled={added.has(company.org_number)}
                      onClick={(event) => {
                        event.stopPropagation();
                        addLead(company);
                      }}
                      className="rounded-2xl border border-[#2b2118] px-4 py-2 text-sm font-black text-[#2b2118] transition hover:bg-[#2b2118] hover:text-[#fffaf0] disabled:border-[#d8c9b0] disabled:bg-[#efe1c7] disabled:text-[#8b7357]"
                    >
                      {added.has(company.org_number) ? "Lagt til" : "Legg til"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!loading && results.length === 0 && (
        <div className="rounded-[2rem] border border-dashed border-[#d8c9b0] bg-[#fffaf0]/70 p-10 text-center">
          <p className="font-display text-3xl font-black text-[#2b2118]">Ingen ledige bedrifter i dette søket</p>
          <p className="mt-2 text-[#6f5a43]">Prøv å utvide filtrene. Bedrifter som allerede er tatt vises ikke her.</p>
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
