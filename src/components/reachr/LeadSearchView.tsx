"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReachrCompany, CompanySignal } from "@/lib/reachr";
import {
  INDUSTRY_FILTERS,
  formatMoney,
  scoreNameMatch,
  companySignals,
} from "@/lib/reachr";
import ReachrCompanyDrawer from "./ReachrCompanyDrawer";
import { createClient } from "@/lib/supabase/client";

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
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [industry, setIndustry] = useState("");
  const [nace, setNace] = useState("B2B");
  const [employees, setEmployees] = useState("all");
  const [orgForm, setOrgForm] = useState("");
  const [mva, setMva] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [hasWebsite, setHasWebsite] = useState(false);
  const [newlyRegistered, setNewlyRegistered] = useState(false);
  const [minRevenue, setMinRevenue] = useState("");
  const [maxRevenue, setMaxRevenue] = useState("");
  const [minResult, setMinResult] = useState("");
  const [results, setResults] = useState<ReachrCompany[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const [finding, setFinding] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
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

  useEffect(() => {
    void supabase
      .from("reachr_lead_claims")
      .select("org_number")
      .then(({ data }) => setClaimed(new Set((data ?? []).map((row) => row.org_number))));

    const channel = supabase
      .channel("reachr-lead-claims")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reachr_lead_claims" }, (payload) => {
        const org = (payload.new as { org_number: string }).org_number;
        setClaimed((current) => new Set(current).add(org));
        setResults((current) => current.filter((company) => company.org_number !== org));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "reachr_lead_claims" }, (payload) => {
        const org = (payload.old as { org_number: string }).org_number;
        setClaimed((current) => {
          const next = new Set(current);
          next.delete(org);
          return next;
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase]);

  const activeFilters = useMemo(
    () =>
      [nace && nace !== "B2B", employees !== "all", orgForm, mva, hasPhone, hasEmail, hasWebsite, newlyRegistered, minRevenue, maxRevenue, minResult]
        .filter(Boolean).length,
    [employees, hasEmail, hasPhone, hasWebsite, newlyRegistered, maxRevenue, minResult, minRevenue, mva, nace, orgForm],
  );
  const ringableCount = useMemo(
    () => results.filter((company) => Boolean(company.phone)).length,
    [results],
  );
  // Kun filtrering her – IKKE sortering. Rekkefølgen bestemmes én gang når
  // søket lastes (se search()), slik at «Finn nr.» ikke får raden til å hoppe
  // oppover og miste plassen din.
  const visibleResults = useMemo(() => {
    return hasPhone ? results.filter((c) => Boolean(c.phone)) : results;
  }, [hasPhone, results]);

  async function search(nextPage = 0, append = false) {
    // Tomt søk er lov: gir et bredt bedriftssøk (alle aktive bedrifter).
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
      size: "100",
    });
    if (mva) params.set("mva", "true");
    if (hasEmail) params.set("hasEmail", "true");
    if (hasWebsite) params.set("hasWebsite", "true");
    if (newlyRegistered) {
      // Nyregistrert: stiftet i løpet av de siste 18 månedene.
      const d = new Date();
      d.setMonth(d.getMonth() - 18);
      params.set("foundedFrom", d.toISOString().slice(0, 10));
    }
    if (minRevenue) params.set("minRevenue", minRevenue);
    if (maxRevenue) params.set("maxRevenue", maxRevenue);
    if (minResult) params.set("minResult", minResult);

    try {
      const res = await fetch(`/api/reachr/search?${params}`);
      const data = (await res.json()) as SearchResponse;
      if (!res.ok) throw new Error(data.error ?? "Søket feilet.");
      const q = query.trim();
      setResults((current) => {
        const next = append ? [...current, ...data.results] : data.results;
        const seen = new Set<string>();
        const deduped = next.filter((company) => {
          if (seen.has(company.org_number)) return false;
          seen.add(company.org_number);
          return true;
        });
        // Sorter rekkefølgen ÉN gang her (navnetreff / ringbare først). Etter
        // dette holdes rekkefølgen stabil, så «Finn nr.» ikke flytter rader.
        deduped.sort((a, b) => {
          if (q) {
            const rel = scoreNameMatch(b.name, q) - scoreNameMatch(a.name, q);
            if (rel !== 0) return rel;
          }
          return contactScore(b) - contactScore(a);
        });
        return deduped;
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

  // Finn telefon for én bedrift på forespørsel (Proff + 1881 + nettside).
  // Erstatter den gamle auto-berikelsen av 20 bedrifter per søk, som gjorde
  // trefflista treg fordi hver bedrift skrapte opptil 6 nettsider.
  async function findNumber(company: ReachrCompany) {
    setFinding((s) => new Set(s).add(company.org_number));
    try {
      const data = await fetch(
        `/api/reachr/company?orgnr=${company.org_number}&deep=1`,
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((d: { company?: ReachrCompany } | null) => d?.company ?? null)
        .catch(() => null);
      if (data) {
        setResults((current) =>
          current.map((item) =>
            item.org_number === company.org_number
              ? mergeContactData(item, data)
              : item,
          ),
        );
      }
    } finally {
      setFinding((s) => {
        const next = new Set(s);
        next.delete(company.org_number);
        return next;
      });
    }
  }

  // Lagre ett lead (rå kompanidata) og fjern det fra trefflista.
  async function postLead(company: ReachrCompany) {
    const res = await fetch("/api/reachr/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Kunne ikke lagre lead.");
    setAdded((current) => new Set([...current, company.org_number]));
    setPicked((s) => {
      const next = new Set(s);
      next.delete(company.org_number);
      return next;
    });
    setResults((current) =>
      current.filter((item) => item.org_number !== company.org_number),
    );
  }

  // Enkelt-tillegg beriker med telefon (deep) før lagring.
  async function addLead(company: ReachrCompany) {
    if (claimed.has(company.org_number)) {
      setError("Leadet ble allerede tatt av en kollega.");
      return;
    }
    const enriched = await fetch(`/api/reachr/company?orgnr=${company.org_number}&deep=1`)
      .then((res) => res.json())
      .then((data: { company?: ReachrCompany }) => data.company ?? company)
      .catch(() => company);
    await postLead(enriched);
  }

  // Bulk-handlinger på avkryssede bedrifter.
  function toggleSelect(org: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(org)) next.delete(org);
      else next.add(org);
      return next;
    });
  }

  async function bulkAdd() {
    setBulkBusy(true);
    const picks = visibleResults.filter(
      (c) => picked.has(c.org_number) && !c.in_crm,
    );
    for (const company of picks) {
      try {
        await postLead(company);
      } catch {
        /* hopp over feilende, fortsett */
      }
    }
    setBulkBusy(false);
  }

  // Dyp sjekk av valgte: henter telefon (om den mangler) OG 1881-søkeord.
  async function bulkCheck() {
    setBulkBusy(true);
    const picks = visibleResults.filter((c) => picked.has(c.org_number));
    for (const company of picks) {
      await findNumber(company);
    }
    setBulkBusy(false);
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

        <div className="mt-5 grid gap-3 md:grid-cols-3">
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
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:col-span-3 xl:grid-cols-5">
            <Toggle label="MVA" checked={mva} onChange={setMva} />
            <Toggle label="Telefon" checked={hasPhone} onChange={setHasPhone} />
            <Toggle label="E-post" checked={hasEmail} onChange={setHasEmail} />
            <Toggle label="Nettside" checked={hasWebsite} onChange={setHasWebsite} />
            <Toggle label="Nyreg." checked={newlyRegistered} onChange={setNewlyRegistered} />
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
          <span>
            {activeFilters} aktive filtre · {ringableCount} ringbare · ringbare leads sorteres først
          </span>
          {total > 0 && <span>{visibleResults.length} vist av ca. {total.toLocaleString("nb-NO")}</span>}
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
            Søk på firmanavn eller org.nr viser også bedrifter som allerede er i
            CRM (med merke). Rene filtersøk viser kun nye prospekter.
          </p>
        </div>

        {picked.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-[#d8c9b0] bg-[#eafff5] px-5 py-3">
            <span className="text-sm font-black text-[#24513b]">
              {picked.size} valgt
            </span>
            <button
              type="button"
              onClick={bulkAdd}
              disabled={bulkBusy}
              className="rounded-full bg-[#09fe94] px-4 py-2 text-sm font-black text-[#171717] transition hover:brightness-95 disabled:opacity-60"
            >
              {bulkBusy ? "Jobber …" : "Legg til valgte"}
            </button>
            <button
              type="button"
              onClick={bulkCheck}
              disabled={bulkBusy}
              className="rounded-full border border-[#2b2118] px-4 py-2 text-sm font-black text-[#2b2118] transition hover:bg-[#2b2118] hover:text-[#fffaf0] disabled:opacity-60"
            >
              {bulkBusy ? "Sjekker …" : "🔎 Sjekk valgte (nr. + 1881)"}
            </button>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="ml-auto text-sm font-bold text-[#6f5a43] hover:underline"
            >
              Fjern valg
            </button>
          </div>
        )}
        <div className="divide-y divide-[#eadcc5] md:hidden">
          {visibleResults.map((company) => (
            <article
              key={company.org_number}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(company)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setSelected(company);
              }}
              className="p-4 transition active:bg-[#f7ffe9]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <input
                    type="checkbox"
                    checked={picked.has(company.org_number)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggleSelect(company.org_number)}
                    className="mt-1.5 h-4 w-4 shrink-0 rounded border-[#b7a991] text-[#09fe94]"
                    aria-label={`Velg ${company.name}`}
                  />
                  <div className="min-w-0">
                  <h3 className="font-display text-2xl font-black leading-tight tracking-[-0.04em] text-[#2b2118]">
                    {company.name}
                  </h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b7357]">
                    Org.nr. {company.org_number}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {company.in_crm && <CrmBadge kind={company.in_crm} />}
                    <SignalBadges signals={companySignals(company)} />
                  </div>
                  </div>
                </div>
                {company.phone ? (
                  <span className="shrink-0 rounded-full border border-[#09fe94]/40 bg-[#09fe94]/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#24513b]">
                    Ringbar
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      findNumber(company);
                    }}
                    disabled={finding.has(company.org_number)}
                    className="shrink-0 rounded-full border border-[#2b2118] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#2b2118] disabled:opacity-50"
                  >
                    {finding.has(company.org_number) ? "Søker …" : "🔎 Finn nr."}
                  </button>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Mini label="Sted" value={company.address.city ?? "Norge"} />
                <Mini label="Ansatte" value={company.employees?.toString() ?? "Ukjent"} />
                <Mini label="Bransje" value={company.industry_code ?? "Ukjent"} />
                <Mini label="Kontakt" value={[company.phone && formatPhone(company.phone), company.email && "Mail", company.website && "Web"].filter(Boolean).join(" · ") || "Ikke funnet"} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs text-[#8b7357]">
                  {company.financials?.revenue != null ? formatMoney(company.financials.revenue) : "Åpne for detaljer"}
                </span>
                <button
                  type="button"
                  disabled={added.has(company.org_number) || claimed.has(company.org_number) || Boolean(company.in_crm)}
                  onClick={(event) => {
                    event.stopPropagation();
                    addLead(company);
                  }}
                  className="rounded-2xl border border-[#2b2118] px-4 py-2 text-sm font-black text-[#2b2118] transition active:scale-[0.98] disabled:border-[#d8c9b0] disabled:bg-[#efe1c7] disabled:text-[#8b7357]"
                >
                  {company.in_crm
                    ? company.in_crm === "customer"
                      ? "Er kunde"
                      : "Er lead"
                    : claimed.has(company.org_number)
                      ? "Tatt av kollega"
                    : added.has(company.org_number)
                      ? "Lagt til"
                      : "Legg til"}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e4d3b8] text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Velg alle synlige"
                    checked={
                      visibleResults.length > 0 &&
                      visibleResults.every((c) => picked.has(c.org_number))
                    }
                    onChange={(event) =>
                      setPicked(
                        event.target.checked
                          ? new Set(visibleResults.map((c) => c.org_number))
                          : new Set(),
                      )
                    }
                    className="h-4 w-4 rounded border-[#b7a991] text-[#09fe94]"
                  />
                </th>
                <th className="px-5 py-3">Bedrift</th>
                <th className="px-5 py-3">Sted</th>
                <th className="px-5 py-3">Bransje</th>
                <th className="px-5 py-3">Ansatte</th>
                <th className="px-5 py-3">Kontakt</th>
                <th className="px-5 py-3">Økonomi</th>
                <th className="px-5 py-3">Kilder</th>
                <th className="sticky right-0 z-20 bg-[#fffaf0] px-4 py-3 text-right shadow-[-10px_0_12px_-10px_rgba(43,33,24,0.12)]">
                  Handling
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleResults.map((company) => (
                <tr
                  key={company.org_number}
                  onClick={() => setSelected(company)}
                  className="group cursor-pointer border-b border-[#eadcc5] transition hover:bg-[#f7ffe9]"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelected(company);
                  }}
                >
                  <td className="px-3 py-4" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={picked.has(company.org_number)}
                      onChange={() => toggleSelect(company.org_number)}
                      className="h-4 w-4 rounded border-[#b7a991] text-[#09fe94]"
                      aria-label={`Velg ${company.name}`}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-display text-xl font-black leading-tight tracking-[-0.03em] text-[#2b2118]">
                      {company.name}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b7357]">
                      Org.nr. {company.org_number}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {company.in_crm && <CrmBadge kind={company.in_crm} />}
                      <SignalBadges signals={companySignals(company)} />
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-[#2b2118]">{company.address.city ?? "Norge"}</td>
                  <td className="max-w-xs px-5 py-4 text-sm text-[#6f5a43]">
                    <span className="font-semibold text-[#2b2118]">{company.industry_code ?? "—"}</span>
                    {company.industry ? ` · ${company.industry}` : ""}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-[#2b2118]">{company.employees ?? "Ukjent"}</td>
                  <td className="px-5 py-4 text-sm text-[#6f5a43]">
                    <div className="space-y-1">
                      {company.phone ? (
                        <a
                          href={`tel:${company.phone}`}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex rounded-full border border-[#09fe94]/40 bg-[#09fe94]/15 px-3 py-1 text-xs font-black text-[#24513b]"
                        >
                          Ringbar: {formatPhone(company.phone)}
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            findNumber(company);
                          }}
                          disabled={finding.has(company.org_number)}
                          className="inline-flex rounded-full border border-[#2b2118] px-3 py-1 text-xs font-black text-[#2b2118] transition hover:bg-[#2b2118] hover:text-[#fffaf0] disabled:opacity-50"
                        >
                          {finding.has(company.org_number) ? "Søker …" : "🔎 Finn nr."}
                        </button>
                      )}
                      <p className="text-xs">
                        {[company.email && "Mail", company.website && "Web"].filter(Boolean).join(" · ") || "Ingen ekstra kontakt"}
                      </p>
                    </div>
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
                          {shortSource(source.label)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="sticky right-0 z-10 bg-[#fffaf0] px-4 py-4 text-right shadow-[-10px_0_12px_-10px_rgba(43,33,24,0.12)] transition group-hover:bg-[#f7ffe9]">
                    <button
                      type="button"
                      disabled={added.has(company.org_number) || claimed.has(company.org_number) || Boolean(company.in_crm)}
                      onClick={(event) => {
                        event.stopPropagation();
                        addLead(company);
                      }}
                      className="rounded-2xl border border-[#2b2118] px-4 py-2 text-sm font-black text-[#2b2118] transition hover:bg-[#2b2118] hover:text-[#fffaf0] disabled:border-[#d8c9b0] disabled:bg-[#efe1c7] disabled:text-[#8b7357]"
                    >
                      {company.in_crm
                        ? company.in_crm === "customer"
                          ? "Er kunde"
                          : "Er lead"
                        : claimed.has(company.org_number)
                          ? "Tatt av kollega"
                        : added.has(company.org_number)
                          ? "Lagt til"
                          : "Legg til"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!loading && visibleResults.length === 0 && (
        <div className="rounded-[2rem] border border-dashed border-[#d8c9b0] bg-[#fffaf0]/70 p-10 text-center">
          <p className="font-display text-3xl font-black text-[#2b2118]">
            {hasPhone
              ? "Ingen ringbare bedrifter i dette søket"
              : "Ingen ledige bedrifter i dette søket"}
          </p>
          <p className="mt-2 text-[#6f5a43]">
            {hasPhone
              ? "Slå av Telefon-filteret for å se bedrifter der telefon må finnes manuelt."
              : "Prøv å utvide filtrene. Bedrifter som allerede er tatt vises ikke her."}
          </p>
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
          alreadyAdded={added.has(selected.org_number) || claimed.has(selected.org_number) || Boolean(selected.in_crm)}
          onClose={() => setSelected(null)}
          onAdd={addLead}
          onEnriched={(company) => {
            setResults((current) =>
              current.map((item) =>
                item.org_number === company.org_number
                  ? mergeContactData(item, company)
                  : item,
              ),
            );
            setSelected((current) =>
              current && current.org_number === company.org_number
                ? mergeContactData(current, company)
                : current,
            );
          }}
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
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`group flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 text-left text-[13px] font-black leading-none transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24513b]/50 focus-visible:ring-offset-2 ${checked ? "border-[#72d9a7] bg-[#e9fff4] text-[#175c3c] shadow-[0_1px_0_rgba(36,81,59,0.08)]" : "border-[#d8c9b0] bg-[#fffaf0] text-[#6f5a43] hover:-translate-y-0.5 hover:border-[#bda98b] hover:bg-white hover:shadow-[0_5px_14px_rgba(86,64,37,0.08)]"}`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span
        aria-hidden="true"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] transition ${checked ? "border-[#24513b] bg-[#24513b] text-white" : "border-[#c9b99f] bg-[#f8eedc] text-transparent group-hover:border-[#8b7357]"}`}
      >
        ✓
      </span>
    </button>
  );
}

// Korte kildenavn så «Kilder»-kolonnen ikke sprenger tabellbredden.
function shortSource(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("brønnøysund") || l.includes("brreg")) return "Brreg";
  if (l.includes("nettside") || l.includes("website")) return "Nettside";
  if (l.includes("proff")) return "Proff";
  if (l.includes("1881")) return "1881";
  if (l.includes("eniro") || l.includes("gule")) return "Gule Sider";
  return label;
}

function SignalBadges({ signals }: { signals: CompanySignal[] }) {
  if (signals.length === 0) return null;
  const style: Record<CompanySignal["tone"], string> = {
    new: "border-[#09fe94]/50 bg-[#eafff5] text-[#0d7a4b]",
    good: "border-[#c9a24b]/50 bg-[#fbf0d3] text-[#8a6a1f]",
    info: "border-[#d8c9b0] bg-[#fff8ea] text-[#8b7357]",
  };
  return (
    <>
      {signals.map((s) => (
        <span
          key={s.label}
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] ${style[s.tone]}`}
        >
          {s.label}
        </span>
      ))}
    </>
  );
}

function CrmBadge({ kind }: { kind: "customer" | "lead" }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#c9a24b] bg-[#fbf0d3] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#8a6a1f]">
      {kind === "customer" ? "Allerede kunde" : "Allerede lead"}
    </span>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#eadcc5] bg-[#fff8ea] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8b7357]">{label}</p>
      <p className="mt-1 truncate font-semibold text-[#2b2118]">{value}</p>
    </div>
  );
}

function contactScore(company: ReachrCompany): number {
  const phoneScore = company.selected_contact?.priority === "daily_manager"
    ? 140
    : company.selected_contact?.priority === "chairperson"
      ? 130
      : company.selected_contact?.priority === "company_main"
        ? 100
        : company.phone
          ? 70
          : 0;
  return phoneScore + (company.email ? 20 : 0) + (company.website ? 10 : 0);
}

function mergeContactData(base: ReachrCompany, update: ReachrCompany): ReachrCompany {
  return {
    ...base,
    // The enrichment endpoint applies the explicit contact priority and
    // verification policy. Its selected number must therefore win over the
    // unqualified phone returned by the broad company search.
    phone: update.phone,
    email: base.email ?? update.email,
    website: base.website ?? update.website,
    purpose: base.purpose ?? update.purpose,
    keywords: update.keywords?.length ? update.keywords : base.keywords,
    financials: update.financials ?? base.financials,
    contact_candidates: update.contact_candidates ?? base.contact_candidates,
    selected_contact: update.selected_contact ?? base.selected_contact,
    data_sources: update.data_sources?.length ? update.data_sources : base.data_sources,
  };
}

function formatPhone(phone: string): string {
  const normalized = phone.replace(/^\+47/, "");
  return normalized.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}
