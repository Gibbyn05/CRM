"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReachrCompany, ReachrSearchResult } from "@/lib/reachr";
import { INDUSTRY_FILTERS, formatMoney } from "@/lib/reachr";
import { shouldHideCompany, type Logo1881Status } from "@/lib/reachr/logo-filter";
import { createClient } from "@/lib/supabase/client";
import ReachrCompanyDrawer from "./ReachrCompanyDrawer";

type SearchResponse = {
  results: ReachrSearchResult[];
  total: number;
  page: number;
  has_more: boolean;
  error?: string;
};

interface LogoCheckResult {
  org_number: string;
  status: Logo1881Status;
  match_method: "org_number" | "name_address_phone" | "none";
  checked_at: string | null;
  message?: string;
  from_cache: boolean;
}

interface KeywordSuggestion {
  keyword: string;
  source: "internal" | "gulesider";
  nace_code: string | null;
}

interface DataSourceStatus {
  status: "active" | "not_configured" | "error";
  message?: string;
}

const LOGO_STATUS_LABEL: Record<Logo1881Status, string> = {
  found: "Logo funnet",
  not_found: "Ingen logo funnet",
  uncertain: "Usikker match",
  not_checked: "Ikke kontrollert",
};

const LOGO_STATUS_STYLE: Record<Logo1881Status, string> = {
  found: "border-amber-300 bg-amber-50 text-amber-800",
  not_found: "border-[#09fe94]/40 bg-[#09fe94]/15 text-[#24513b]",
  uncertain: "border-[#d8c9b0] bg-[#fff8ea] text-[#8b7357]",
  not_checked: "border-[#d8c9b0] bg-[#fffaf0] text-[#8b7357]",
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

const LOGO_CHECK_BATCH_SIZE = 10;

type Props = {
  userId: string;
  initialExcludeLogo1881: boolean;
};

export default function LeadSearchView({ userId, initialExcludeLogo1881 }: Props) {
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
  const [minRevenue, setMinRevenue] = useState("");
  const [maxRevenue, setMaxRevenue] = useState("");
  const [minResult, setMinResult] = useState("");
  const [results, setResults] = useState<ReachrSearchResult[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ReachrSearchResult | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 1881-logofilter.
  const [excludeLogo1881, setExcludeLogo1881] = useState(initialExcludeLogo1881);
  const [logoStatuses, setLogoStatuses] = useState<Record<string, LogoCheckResult>>({});
  const [logoCheckProgress, setLogoCheckProgress] = useState<{ checked: number; total: number } | null>(null);
  const [logoCheckError, setLogoCheckError] = useState("");
  const [showFilteredList, setShowFilteredList] = useState(false);

  // Gule Sider / interne søkeordforslag.
  const [suggestedKeywords, setSuggestedKeywords] = useState<KeywordSuggestion[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [customKeyword, setCustomKeyword] = useState("");
  const [gulesiderStatus, setGulesiderStatus] = useState<DataSourceStatus | null>(null);
  const [keywordsLoading, setKeywordsLoading] = useState(false);

  useEffect(() => {
    search(0, false);
    // Last standardlisten én gang når fanen åpnes. Standardfilteret er B2B.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (excludeLogo1881 && results.length > 0) {
      runLogoCheck(results);
    }
    // Kjør kun når filteret slås PÅ eller nye bedrifter dukker opp mens det er på.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excludeLogo1881, results]);

  const activeFilters = useMemo(
    () =>
      [nace && nace !== "B2B", employees !== "all", orgForm, mva, hasPhone, hasEmail, hasWebsite, minRevenue, maxRevenue, minResult]
        .filter(Boolean).length,
    [employees, hasEmail, hasPhone, hasWebsite, maxRevenue, minResult, minRevenue, mva, nace, orgForm],
  );
  const ringableCount = useMemo(
    () => results.filter((company) => Boolean(company.phone)).length,
    [results],
  );

  const logoSummary = useMemo(() => {
    const checked = results.filter((company) => logoStatuses[company.org_number]).length;
    const found = results.filter((company) => logoStatuses[company.org_number]?.status === "found").length;
    const uncertain = results.filter((company) => logoStatuses[company.org_number]?.status === "uncertain").length;
    const notChecked = results.length - checked;
    return { checked, found, uncertain, notChecked, kept: results.length - found };
  }, [results, logoStatuses]);

  const filteredOutByLogo = useMemo(
    () => results.filter((company) => logoStatuses[company.org_number]?.status === "found"),
    [results, logoStatuses],
  );

  const visibleResults = useMemo(() => {
    const filtered = (hasPhone ? results.filter((company) => Boolean(company.phone)) : results).filter(
      (company) => !shouldHideCompany(logoStatuses[company.org_number]?.status, excludeLogo1881),
    );
    return [...filtered].sort((a, b) => contactScore(b) - contactScore(a));
  }, [hasPhone, results, excludeLogo1881, logoStatuses]);

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
      size: "100",
    });
    if (mva) params.set("mva", "true");
    if (hasEmail) params.set("hasEmail", "true");
    if (hasWebsite) params.set("hasWebsite", "true");
    if (minRevenue) params.set("minRevenue", minRevenue);
    if (maxRevenue) params.set("maxRevenue", maxRevenue);
    if (minResult) params.set("minResult", minResult);
    if (selectedKeywords.size > 0) params.set("keywords", [...selectedKeywords].join(","));

    try {
      const res = await fetch(`/api/reachr/search?${params}`);
      const data = (await res.json()) as SearchResponse;
      if (!res.ok) throw new Error(data.error ?? "Søket feilet.");
      setResults((current) => {
        const next = append ? [...current, ...data.results] : data.results;
        const seen = new Set<string>();
        const deduped = next.filter((company) => {
          if (seen.has(company.org_number)) return false;
          seen.add(company.org_number);
          return true;
        });
        hydratePhoneData(deduped);
        return deduped;
      });
      setTotal(data.total);
      setHasMore(data.has_more);
      setPage(data.page);
      if (!append) loadKeywordSuggestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Søket feilet.");
    } finally {
      setLoading(false);
    }
  }

  async function loadKeywordSuggestions() {
    if (!query.trim() && !industry.trim()) {
      setSuggestedKeywords([]);
      setGulesiderStatus(null);
      return;
    }
    setKeywordsLoading(true);
    try {
      const params = new URLSearchParams({ q: query, industry });
      const res = await fetch(`/api/reachr/keywords?${params}`);
      const data = (await res.json()) as {
        suggestions?: KeywordSuggestion[];
        gulesider_status?: DataSourceStatus;
      };
      if (res.ok) {
        setSuggestedKeywords(data.suggestions ?? []);
        setGulesiderStatus(data.gulesider_status ?? null);
      }
    } catch {
      // Søkeordforslag er en hjelp, ikke kritisk — feiler stille.
    } finally {
      setKeywordsLoading(false);
    }
  }

  function toggleKeyword(keyword: string) {
    setSelectedKeywords((current) => {
      const next = new Set(current);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  }

  function addCustomKeyword() {
    const value = customKeyword.trim().toLowerCase();
    if (!value) return;
    setSelectedKeywords((current) => new Set([...current, value]));
    if (!suggestedKeywords.some((item) => item.keyword === value)) {
      setSuggestedKeywords((current) => [...current, { keyword: value, source: "internal", nace_code: null }]);
    }
    setCustomKeyword("");
  }

  async function runLogoCheck(companies: ReachrSearchResult[]) {
    const pending = companies.filter((company) => !logoStatuses[company.org_number]);
    if (pending.length === 0) return;
    setLogoCheckError("");
    setLogoCheckProgress({ checked: 0, total: pending.length });

    let checkedSoFar = 0;
    for (let index = 0; index < pending.length; index += LOGO_CHECK_BATCH_SIZE) {
      const batch = pending.slice(index, index + LOGO_CHECK_BATCH_SIZE);
      try {
        const res = await fetch("/api/reachr/logo-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companies: batch.map((company) => ({
              org_number: company.org_number,
              name: company.name,
              address: company.address.address,
              phone: company.phone,
            })),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          results?: LogoCheckResult[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "1881-kontroll feilet.");
        setLogoStatuses((current) => {
          const next = { ...current };
          for (const result of data.results ?? []) {
            next[result.org_number] = result;
          }
          return next;
        });
      } catch (err) {
        setLogoCheckError(
          err instanceof Error ? err.message : "Kunne ikke kontrollere mot 1881 akkurat nå.",
        );
      }
      checkedSoFar += batch.length;
      setLogoCheckProgress({ checked: checkedSoFar, total: pending.length });
    }
    setLogoCheckProgress(null);
  }

  async function toggleExcludeLogo1881(next: boolean) {
    setExcludeLogo1881(next);
    if (!userId) return;
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ reachr_search_preferences: { exclude_1881_logo: next } })
      .eq("id", userId);
  }

  async function hydratePhoneData(companies: ReachrSearchResult[]) {
    const candidates = companies
      .filter((company) => !company.phone && company.website)
      .slice(0, 20);
    if (candidates.length === 0) return;

    for (let index = 0; index < candidates.length; index += 4) {
      const batch = candidates.slice(index, index + 4);
      const enriched = await Promise.allSettled(
        batch.map((company) =>
          fetch(`/api/reachr/company?orgnr=${company.org_number}`)
            .then((res) => res.ok ? res.json() : null)
            .then((data: { company?: ReachrCompany } | null) => data?.company ?? null),
        ),
      );
      const updates = enriched
        .map((result) => result.status === "fulfilled" ? result.value : null)
        .filter((company): company is ReachrCompany => Boolean(company));
      if (updates.length === 0) continue;
      setResults((current) =>
        current.map((company) => {
          const update = updates.find((item) => item.org_number === company.org_number);
          return update ? mergeContactData(company, update) : company;
        }),
      );
    }
  }

  // Tar imot ReachrCompany (bredere enn ReachrSearchResult) slik at den kan
  // brukes både fra søkeresultater og fra ReachrCompanyDrawer sitt onAdd.
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
          <div className="grid grid-cols-2 gap-2 pt-6 xl:grid-cols-4">
            <Toggle label="MVA" checked={mva} onChange={setMva} />
            <Toggle label="Telefon" checked={hasPhone} onChange={setHasPhone} />
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

        <div className="mt-4 rounded-2xl border border-[#d8c9b0] bg-[#fff8ea] p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={excludeLogo1881}
              onChange={(event) => toggleExcludeLogo1881(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[#d8c9b0]"
            />
            <span>
              <span className="block text-sm font-black text-[#2b2118]">
                Ekskluder bedrifter med logo på 1881
              </span>
              <span className="mt-0.5 block text-xs text-[#8b7357]">
                Kontrollerer hver bedrift mot 1881 (org.nr, med navn/adresse/telefon som reserve) og skjuler kun bekreftede treff. Usikre og ikke-kontrollerte vises fortsatt.
              </span>
            </span>
          </label>

          {logoCheckProgress && (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#efe1c7]">
                <div
                  className="h-full rounded-full bg-[#09fe94] transition-all"
                  style={{ width: `${Math.round((logoCheckProgress.checked / Math.max(1, logoCheckProgress.total)) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-[#8b7357]">
                Kontrollerer 1881-logo: {logoCheckProgress.checked} av {logoCheckProgress.total} ...
              </p>
            </div>
          )}
          {logoCheckError && (
            <p className="mt-2 text-xs font-semibold text-red-700">{logoCheckError}</p>
          )}
          {logoSummary.checked > 0 && !logoCheckProgress && (
            <p className="mt-3 text-xs font-semibold text-[#6f5a43]">
              {logoSummary.checked} kontrollert · {logoSummary.kept} beholdt · {logoSummary.found}{" "}
              {excludeLogo1881 ? "filtrert bort (logo funnet)" : "har logo (ville blitt filtrert bort med filteret på)"} ·{" "}
              {logoSummary.uncertain + logoSummary.notChecked} usikre/ikke kontrollert
              {logoSummary.found > 0 && (
                <button
                  type="button"
                  onClick={() => setShowFilteredList(true)}
                  className="ml-2 rounded-full border border-[#2b2118] px-3 py-1 text-[11px] font-black text-[#2b2118] hover:bg-[#efe1c7]"
                >
                  Vis filtrerte bedrifter ({logoSummary.found})
                </button>
              )}
            </p>
          )}
        </div>

        {(suggestedKeywords.length > 0 || keywordsLoading) && (
          <div className="mt-4 rounded-2xl border border-[#d8c9b0] bg-[#f6ecd9] p-4">
            <p className="label-eyebrow">
              Foreslåtte søkeord {keywordsLoading ? "· laster ..." : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestedKeywords.map((item) => (
                <button
                  key={item.keyword}
                  type="button"
                  onClick={() => toggleKeyword(item.keyword)}
                  title={item.source === "internal" ? "Fra intern bransjeordbok" : "Fra Gule Sider"}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    selectedKeywords.has(item.keyword)
                      ? "border-[#09fe94]/40 bg-[#09fe94]/20 text-[#24513b]"
                      : "border-[#d8c9b0] bg-[#fffaf0] text-[#8b7357] hover:bg-[#efe1c7]"
                  }`}
                >
                  {item.keyword}
                  <span className="ml-1 text-[9px] uppercase opacity-70">
                    {item.source === "internal" ? "ordbok" : "gule sider"}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={customKeyword}
                onChange={(event) => setCustomKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomKeyword();
                  }
                }}
                placeholder="Legg til eget søkeord"
                className="reachr-input max-w-xs"
              />
              <button
                type="button"
                onClick={addCustomKeyword}
                className="rounded-2xl border border-[#d8c9b0] bg-[#fffaf0] px-3 py-2 text-xs font-black text-[#2b2118] hover:bg-[#efe1c7]"
              >
                Legg til
              </button>
              {selectedKeywords.size > 0 && (
                <button
                  type="button"
                  onClick={() => search(0, false)}
                  className="rounded-2xl bg-[#2b2118] px-4 py-2 text-xs font-black text-[#fffaf0] hover:brightness-110"
                >
                  Utvid søk med valgte søkeord ({selectedKeywords.size})
                </button>
              )}
            </div>
            {gulesiderStatus && gulesiderStatus.status !== "active" && (
              <p className="mt-2 text-[11px] text-[#8b7357]">
                Gule Sider-forslag: {gulesiderStatus.message ?? "Krever datakildetilgang."}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#6f5a43]">
          <span>{activeFilters} aktive filtre · {ringableCount} ringbare · ringbare leads sorteres først</span>
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
            Bedrifter som finnes i Mine leads eller Kunder er filtrert bort globalt.
          </p>
        </div>
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
                <div className="min-w-0">
                  <h3 className="font-display text-2xl font-black leading-tight tracking-[-0.04em] text-[#2b2118]">
                    {company.name}
                  </h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b7357]">
                    Org.nr. {company.org_number}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                  company.phone
                    ? "border-[#09fe94]/40 bg-[#09fe94]/15 text-[#24513b]"
                    : "border-[#d8c9b0] bg-[#fff8ea] text-[#8b7357]"
                }`}>
                  {company.phone ? "Ringbar" : "Mangler tlf"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Logo1881Badge status={logoStatuses[company.org_number]?.status} />
                {company.matched_keyword && (
                  <span className="rounded-full border border-[#d8c9b0] bg-[#fff8ea] px-2 py-1 text-[10px] font-black text-[#8b7357]">
                    Funnet via: {company.matched_keyword}
                  </span>
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
                  disabled={added.has(company.org_number)}
                  onClick={(event) => {
                    event.stopPropagation();
                    addLead(company);
                  }}
                  className="rounded-2xl border border-[#2b2118] px-4 py-2 text-sm font-black text-[#2b2118] transition active:scale-[0.98] disabled:border-[#d8c9b0] disabled:bg-[#efe1c7] disabled:text-[#8b7357]"
                >
                  {added.has(company.org_number) ? "Lagt til" : "Legg til"}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e4d3b8] text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">
                <th className="px-5 py-3">Bedrift</th>
                <th className="px-5 py-3">Sted</th>
                <th className="px-5 py-3">Bransje</th>
                <th className="px-5 py-3">Ansatte</th>
                <th className="px-5 py-3">Kontakt</th>
                <th className="px-5 py-3">Økonomi</th>
                <th className="px-5 py-3">1881-logo</th>
                <th className="px-5 py-3">Kilder</th>
                <th className="px-5 py-3 text-right">Handling</th>
              </tr>
            </thead>
            <tbody>
              {visibleResults.map((company) => (
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
                    {company.matched_keyword && (
                      <p className="mt-1 text-[10px] font-bold text-[#8b7357]">
                        Funnet via: {company.matched_keyword}
                      </p>
                    )}
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
                        <span className="inline-flex rounded-full border border-[#d8c9b0] bg-[#fff8ea] px-3 py-1 text-xs font-black text-[#8b7357]">
                          Mangler telefon
                        </span>
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
                    <Logo1881Badge status={logoStatuses[company.org_number]?.status} />
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

      {!loading && visibleResults.length === 0 && (
        <div className="rounded-[2rem] border border-dashed border-[#d8c9b0] bg-[#fffaf0]/70 p-10 text-center">
          <p className="font-display text-3xl font-black text-[#2b2118]">
            {hasPhone ? "Ingen ringbare bedrifter i dette søket" : "Ingen ledige bedrifter i dette søket"}
          </p>
          <p className="mt-2 text-[#6f5a43]">
            {hasPhone ? "Slå av Telefon-filteret for å se bedrifter der telefon må finnes manuelt." : "Prøv å utvide filtrene. Bedrifter som allerede er tatt vises ikke her."}
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
          alreadyAdded={added.has(selected.org_number)}
          onClose={() => setSelected(null)}
          onAdd={addLead}
        />
      )}

      {showFilteredList && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-[#171717]/50 p-4"
          onClick={() => setShowFilteredList(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-[#d8c9b0] bg-[#fffaf0] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-display text-2xl font-black text-[#2b2118]">
                Filtrert bort ({filteredOutByLogo.length}) — bekreftet logo på 1881
              </h3>
              <button
                type="button"
                onClick={() => setShowFilteredList(false)}
                className="rounded-xl border border-[#d8c9b0] px-3 py-2 text-sm font-bold text-[#2b2118] hover:bg-[#efe1c7]"
              >
                Lukk
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {filteredOutByLogo.map((company) => (
                <button
                  key={company.org_number}
                  type="button"
                  onClick={() => {
                    setShowFilteredList(false);
                    setSelected(company);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#eadcc5] bg-[#fff8ea] p-3 text-left transition hover:bg-[#f7ffe9]"
                >
                  <span>
                    <span className="block font-semibold text-[#2b2118]">{company.name}</span>
                    <span className="block text-xs text-[#8b7357]">Org.nr. {company.org_number} · {company.address.city ?? "Norge"}</span>
                  </span>
                  <Logo1881Badge status="found" />
                </button>
              ))}
              {filteredOutByLogo.length === 0 && (
                <p className="text-sm text-[#8b7357]">Ingen bedrifter er filtrert bort ennå.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Logo1881Badge({ status }: { status: Logo1881Status | undefined }) {
  const effective = status ?? "not_checked";
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${LOGO_STATUS_STYLE[effective]}`}>
      {LOGO_STATUS_LABEL[effective]}
    </span>
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
    <div className="rounded-2xl border border-[#eadcc5] bg-[#fff8ea] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8b7357]">{label}</p>
      <p className="mt-1 truncate font-semibold text-[#2b2118]">{value}</p>
    </div>
  );
}

function contactScore(company: ReachrSearchResult): number {
  return (company.phone ? 100 : 0) + (company.email ? 20 : 0) + (company.website ? 10 : 0);
}

function mergeContactData(base: ReachrSearchResult, update: ReachrCompany): ReachrSearchResult {
  return {
    ...base,
    phone: base.phone ?? update.phone,
    email: base.email ?? update.email,
    website: base.website ?? update.website,
    purpose: base.purpose ?? update.purpose,
    data_sources: update.data_sources?.length ? update.data_sources : base.data_sources,
  };
}

function formatPhone(phone: string): string {
  const normalized = phone.replace(/^\+47/, "");
  return normalized.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}
