"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReachrCompany, ReachrLead } from "@/lib/reachr";
import { formatMoney } from "@/lib/reachr";

type Props = {
  company: ReachrCompany | ReachrLead;
  open: boolean;
  alreadyAdded?: boolean;
  onClose: () => void;
  onAdd?: (company: ReachrCompany) => Promise<void> | void;
};

export default function ReachrCompanyDrawer({
  company,
  open,
  alreadyAdded,
  onClose,
  onAdd,
}: Props) {
  const [detail, setDetail] = useState<ReachrCompany | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const active = detail ?? company;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDetail(null);
    setLoading(true);
    fetch(`/api/reachr/company?orgnr=${company.org_number}`)
      .then((res) => res.json())
      .then((data: { company?: ReachrCompany }) => {
        if (!cancelled && data.company) setDetail(data.company);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company.org_number, open]);

  const primaryPeople = useMemo(
    () =>
      (active.roles ?? []).filter((role) =>
        ["DAGL", "LEDE", "MEDL", "REGN", "REV"].includes(role.role_code),
      ),
    [active.roles],
  );
  const salesBrief = useMemo(() => buildSalesBrief(active), [active]);
  const missingData = useMemo(() => getMissingData(active), [active]);
  const externalLinks = useMemo(() => getExternalLinks(active), [active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end bg-[#171717]/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="h-full w-full overflow-y-auto border-l border-[#d8c9b0] bg-[#fffaf0] shadow-2xl sm:max-w-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-[#d8c9b0] bg-[#fffaf0]/95 p-6 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="label-eyebrow">Firmakort</p>
              <h2 className="mt-2 font-display text-3xl font-black leading-none tracking-[-0.04em] text-[#2b2118] sm:text-4xl">
                {active.name}
              </h2>
              <p className="mt-3 text-sm text-[#6f5a43]">
                Org.nr. {active.org_number}
                {active.organization_form ? ` · ${active.organization_form}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#d8c9b0] px-3 py-2 text-sm font-bold text-[#2b2118] hover:bg-[#efe1c7]"
            >
              Lukk
            </button>
          </div>
          {onAdd && (
            <button
              type="button"
              disabled={alreadyAdded || adding}
              onClick={async () => {
                setAdding(true);
                try {
                  await onAdd(active);
                } finally {
                  setAdding(false);
                }
              }}
              className="mt-5 rounded-2xl bg-[#09fe94] px-5 py-3 text-sm font-black text-[#171717] shadow-[0_18px_45px_rgba(9,254,148,0.22)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-[#d8c9b0] disabled:text-[#6f5a43]"
            >
              {alreadyAdded ? "Ligger i Mine leads" : adding ? "Legger til ..." : "Legg til i Mine leads"}
            </button>
          )}
        </div>

        <div className="space-y-6 p-6">
          {loading && (
            <div className="rounded-3xl border border-[#d8c9b0] bg-[#f6ecd9] p-5 text-sm text-[#6f5a43]">
              Henter roller og regnskap fra offentlige registre ...
            </div>
          )}

          <section className="rounded-[2rem] border border-[#2b2118] bg-[#f6ecd9] p-5 shadow-[0_18px_50px_rgba(43,33,24,0.08)]">
            <p className="label-eyebrow">Salgssammendrag</p>
            <h3 className="mt-2 font-display text-3xl font-black leading-tight tracking-[-0.04em] text-[#2b2118]">
              {salesBrief.headline}
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#5c4936]">
              {salesBrief.summary}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {salesBrief.points.map((point) => (
                <div key={point.label} className="rounded-2xl border border-[#d8c9b0] bg-[#fffaf0] p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">{point.label}</p>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-[#2b2118]">{point.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Ansatte" value={active.employees?.toString() ?? "Ukjent"} />
            <Metric label="Omsetning" value={formatMoney(active.financials?.revenue)} />
            <Metric label="Årsresultat" value={formatMoney(active.financials?.annual_result)} />
            <Metric label="Egenkapital" value={formatMoney(active.financials?.equity)} />
          </section>

          <section className="rounded-3xl border border-[#d8c9b0] bg-[#fff8ea] p-5">
            <p className="label-eyebrow">Datakilder</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(active.data_sources?.length ? active.data_sources : [{
                provider: "brreg",
                label: "Brreg",
                enabled: true,
                fields: ["register"],
                status: "active" as const,
              }]).map((source) => (
                <span
                  key={`${source.provider}-${source.status}`}
                  title={source.message}
                  className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                    source.status === "active"
                      ? "border-[#09fe94]/40 bg-[#09fe94]/15 text-[#24513b]"
                      : source.status === "not_configured"
                        ? "border-[#d8c9b0] bg-[#fffaf0] text-[#8b7357]"
                        : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {source.label}
                  {source.status !== "active" ? " ikke aktiv" : ""}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#8b7357]">
              Kontakt- og persondata hentes kun via tilgjengelige API-avtaler. Proff, Eniro/Gule Sider og 1881 krever egne nøkler før de blir aktive.
            </p>
            {missingData.length > 0 && (
              <div className="mt-4 rounded-2xl border border-[#d8c9b0] bg-[#fffaf0] p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">Manglende datapunkter</p>
                <p className="mt-2 text-sm leading-relaxed text-[#5c4936]">
                  {missingData.join(", ")}. Dette betyr at kilden ikke leverte feltet, ikke at bedriften nødvendigvis mangler det.
                </p>
              </div>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-[#d8c9b0] bg-[#f6ecd9] p-5">
              <p className="label-eyebrow">Salgsviktig informasjon</p>
              <div className="mt-4 grid gap-4 text-sm">
                <Info label="Bransje" value={active.industry ?? "Ikke tilgjengelig"} />
                <Info label="Bransjekode" value={active.industry_code ?? "Ikke tilgjengelig"} />
                <Info label="Stiftet" value={active.founded_at ?? "Ikke tilgjengelig"} />
                <Info label="Adresse" value={[active.address.address, active.address.postal_code, active.address.city].filter(Boolean).join(", ") || "Ikke tilgjengelig"} />
                <Info label="Formål/aktivitet" value={active.purpose ?? "Ikke tilgjengelig"} />
              </div>
            </div>

            <div className="rounded-3xl border border-[#d8c9b0] bg-[#fff8ea] p-5">
              <p className="label-eyebrow">Kontakt</p>
              <div className="mt-4 space-y-3 text-sm">
                <ContactRow label="Telefon" value={active.phone} href={active.phone ? `tel:${active.phone}` : null} />
                <ContactRow label="E-post" value={active.email} href={active.email ? `mailto:${active.email}` : null} />
                <ContactRow label="Nettside" value={active.website} href={active.website} />
              </div>
              <div className="mt-4 rounded-2xl border border-[#d8c9b0] bg-[#fffaf0] p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">Finn kontaktinfo</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {externalLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-[#d8c9b0] px-3 py-2 text-xs font-black text-[#2b2118] transition hover:bg-[#efe1c7]"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#8b7357]">
                  Gratis søk bruker Brreg og bedriftens egen nettside. Hvis telefon fortsatt mangler, må den normalt finnes manuelt eller via betalt katalog-API.
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-[#d8c9b0] bg-[#fff8ea] p-5">
              <p className="label-eyebrow">Personer og roller</p>
              <div className="mt-4 space-y-3">
                {primaryPeople.length === 0 ? (
                  <p className="text-sm text-[#8b7357]">Ingen lederroller tilgjengelig fra registeret.</p>
                ) : (
                  primaryPeople.slice(0, 8).map((role, index) => (
                    <div key={`${role.role_code}-${role.name}-${index}`} className="rounded-2xl border border-[#e4d3b8] bg-[#fffaf0] p-3">
                      <p className="font-semibold text-[#2b2118]">{role.name}</p>
                      <p className="text-xs uppercase tracking-[0.14em] text-[#8b7357]">{role.role_name}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[#d8c9b0] bg-[#f6ecd9] p-5">
              <p className="label-eyebrow">Registerstatus</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge active={active.vat_registered}>MVA</Badge>
                <Badge active={active.business_register_registered}>Foretaksregisteret</Badge>
                <Badge active={!active.bankrupt}>Ikke konkurs</Badge>
                <Badge active={!active.under_liquidation}>Ikke under avvikling</Badge>
              </div>
              <div className="mt-6 grid gap-3 text-sm">
                <Info label="Regnskapsår" value={active.financials?.year ?? "Ikke tilgjengelig"} />
                <Info label="Driftsresultat" value={formatMoney(active.financials?.operating_result)} />
                <Info label="Gjeld" value={formatMoney(active.financials?.debt)} />
                <Info label="Eiendeler" value={formatMoney(active.financials?.assets)} />
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[#d8c9b0] bg-[#fff8ea] p-4">
      <p className="label-eyebrow">{label}</p>
      <p className="mt-2 text-xl font-black text-[#2b2118]">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b7357]">{label}</p>
      <p className="mt-1 text-[#2b2118]">{value}</p>
    </div>
  );
}

function ContactRow({ label, value, href }: { label: string; value: string | null | undefined; href: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#e4d3b8] bg-[#fffaf0] p-3">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#8b7357]">{label}</span>
      {value && href ? (
        <a className="truncate text-sm font-semibold text-[#2b2118] underline decoration-[#09fe94] decoration-2 underline-offset-4" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {value}
        </a>
      ) : (
        <span className="text-sm text-[#8b7357]">Ikke funnet</span>
      )}
    </div>
  );
}

function Badge({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${active ? "border-[#09fe94]/40 bg-[#09fe94]/15 text-[#24513b]" : "border-[#d8c9b0] bg-[#fffaf0] text-[#8b7357]"}`}>
      {children}
    </span>
  );
}

function buildSalesBrief(company: ReachrCompany | ReachrLead) {
  const age = getCompanyAge(company.founded_at);
  const location = company.address.city ?? company.address.municipality ?? "ukjent sted";
  const hasContact = Boolean(company.phone || company.email || company.website);
  const revenue = company.financials?.revenue;
  const role = (company.roles ?? []).find((item) => item.role_code === "DAGL" || item.role_code === "LEDE");

  return {
    headline: `${company.organization_form_code ?? "Bedrift"} innen ${company.industry ?? "ukjent bransje"}`,
    summary: [
      `${company.name} er registrert i ${capitalizeSentence(location)}${age ? ` og har vært aktiv i ca. ${age}` : ""}.`,
      company.industry_code ? `Bransjekode ${company.industry_code} gir grunnlag for segmentering og pitch.` : "Bransjekode mangler, så kvalifisering bør gjøres manuelt.",
      revenue != null ? `Siste tilgjengelige omsetning er ${formatMoney(revenue)}.` : "Regnskap er ikke tilgjengelig i kildene ennå.",
    ].join(" "),
    points: [
      {
        label: "Anbefalt neste steg",
        value: hasContact
          ? "Bruk registrert telefon, e-post eller nettside og logg første kontakt."
          : "Finn telefon eller nettside via snarveiene under før leadet tas videre.",
      },
      {
        label: "Beslutningstaker",
        value: role ? `${role.name}, ${role.role_name}` : "Ikke funnet i registeret. Sjekk Proff, 1881 eller nettside.",
      },
      {
        label: "Kvalifisering",
        value: company.bankrupt || company.under_liquidation
          ? "Lav prioritet fordi selskapet er konkurs eller under avvikling."
          : "Aktivt selskap. Bekreft behov, kontaktflate og økonomisk størrelse før oppfølging.",
      },
    ],
  };
}

function getMissingData(company: ReachrCompany | ReachrLead): string[] {
  return [
    !company.phone ? "telefon" : null,
    !company.email ? "e-post" : null,
    !company.website ? "nettside" : null,
    company.employees == null ? "ansatte" : null,
    !company.financials?.revenue ? "omsetning" : null,
    !(company.roles ?? []).length ? "roller/personer" : null,
  ].filter((item): item is string => Boolean(item));
}

function getExternalLinks(company: ReachrCompany | ReachrLead) {
  const org = company.org_number;
  // Org.nr er unikt og stabilt, så vi slår opp bedriften direkte der det er
  // mulig (Proff/1881/Brreg går rett til firmakortet via org.nr). Google og
  // Gule Sider bruker fritekst (navn + org.nr).
  const text = encodeURIComponent(`${company.name} ${org}`);
  return [
    { label: "Google", href: `https://www.google.com/search?q=${text}` },
    { label: "Proff", href: `https://www.proff.no/company/${org}` },
    { label: "1881", href: `https://www.1881.no/?query=${org}` },
    { label: "Gule Sider", href: `https://www.gulesider.no/${text}/bedrifter` },
    { label: "Brreg", href: `https://virksomhet.brreg.no/nb/oppslag/enheter/${org}` },
  ];
}

function getCompanyAge(foundedAt: string | null | undefined): string | null {
  if (!foundedAt) return null;
  const founded = new Date(foundedAt);
  if (Number.isNaN(founded.getTime())) return null;
  const years = Math.max(0, new Date().getFullYear() - founded.getFullYear());
  if (years === 0) return "under 1 år";
  if (years === 1) return "1 år";
  return `${years} år`;
}

function capitalizeSentence(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
