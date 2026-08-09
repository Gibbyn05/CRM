"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReachrLead, ReachrLeadStatus } from "@/lib/reachr";
import { REACHR_LEAD_STATUSES, formatMoney } from "@/lib/reachr";
import ReachrCompanyDrawer from "./ReachrCompanyDrawer";

type LeadsResponse = { leads?: ReachrLead[]; error?: string };

export default function MyLeadsView() {
  const [leads, setLeads] = useState<ReachrLead[]>([]);
  const [selected, setSelected] = useState<ReachrLead | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ReachrLeadStatus | "alle">("alle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/reachr/leads");
      const data = (await res.json()) as LeadsResponse;
      if (!res.ok) throw new Error(data.error ?? "Kunne ikke hente leads.");
      setLeads(data.leads ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke hente leads.");
    } finally {
      setLoading(false);
    }
  }

  async function patchLead(id: string, patch: Partial<Pick<ReachrLead, "status" | "notes" | "email" | "phone" | "last_contacted_at">>) {
    const res = await fetch(`/api/reachr/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await res.json().catch(() => ({}))) as { lead?: ReachrLead; error?: string };
    if (!res.ok || !data.lead) throw new Error(data.error ?? "Kunne ikke oppdatere lead.");
    setLeads((current) => current.map((lead) => (lead.id === id ? data.lead! : lead)));
    setSelected((current) => (current?.id === id ? data.lead! : current));
  }

  async function removeLead(id: string) {
    const res = await fetch(`/api/reachr/leads/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Kunne ikke slette lead.");
    setLeads((current) => current.filter((lead) => lead.id !== id));
    setSelected(null);
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return leads
      .filter((lead) => (status === "alle" ? true : lead.status === status))
      .filter((lead) => {
        if (!q) return true;
        return [lead.name, lead.org_number, lead.industry, lead.address.city, lead.phone, lead.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      });
  }, [leads, query, status]);

  const stats = useMemo(
    () => ({
      total: leads.length,
      untouched: leads.filter((lead) => lead.status === "Ikke kontaktet").length,
      meetings: leads.filter((lead) => lead.status === "Booket møte").length,
      customers: leads.filter((lead) => lead.status === "Kunde").length,
    }),
    [leads],
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Totalt" value={stats.total} />
        <Stat label="Ikke kontaktet" value={stats.untouched} />
        <Stat label="Bookede møter" value={stats.meetings} />
        <Stat label="Kunder" value={stats.customers} />
      </section>

      <section className="rounded-[2rem] border border-[#d8c9b0] bg-[#fffaf0]/85 p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Søk i mine leads: navn, org.nr, bransje, sted, tlf, e-post"
            className="reachr-input"
          />
          <select value={status} onChange={(event) => setStatus(event.target.value as ReachrLeadStatus | "alle")} className="reachr-input">
            <option value="alle">Alle statuser</option>
            {REACHR_LEAD_STATUSES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <button type="button" onClick={load} className="rounded-2xl border border-[#d8c9b0] bg-[#fffaf0] px-5 py-3 text-sm font-bold text-[#2b2118] hover:bg-[#efe1c7]">
            Oppdater
          </button>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          {loading && <div className="rounded-3xl border border-[#d8c9b0] bg-[#fffaf0] p-6 text-[#6f5a43]">Henter lagrede leads ...</div>}
          {!loading && filtered.length === 0 && (
            <div className="rounded-[2rem] border border-dashed border-[#d8c9b0] bg-[#fffaf0]/70 p-10 text-center">
              <p className="font-display text-3xl font-black text-[#2b2118]">Ingen leads her ennå</p>
              <p className="mt-2 text-[#6f5a43]">Gå til Leadssøk og klikk “Legg til” på bedrifter du vil følge opp.</p>
            </div>
          )}
          {filtered.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => setSelected(lead)}
              className={`block w-full rounded-[1.75rem] border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_22px_60px_rgba(43,33,24,0.10)] ${
                selected?.id === lead.id
                  ? "border-[#09fe94] bg-[#f7ffe9]"
                  : "border-[#d8c9b0] bg-[#fffaf0]"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-2xl font-black leading-tight tracking-[-0.03em] text-[#2b2118]">{lead.name}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8b7357]">
                    {lead.org_number} · {lead.address.city ?? "Norge"} · {lead.industry_code ?? "ukjent kode"}
                  </p>
                </div>
                <span className="rounded-full border border-[#d8c9b0] bg-[#fff8ea] px-3 py-1 text-xs font-black text-[#6f5a43]">
                  {lead.status}
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <Mini label="Ansatte" value={lead.employees?.toString() ?? "Ukjent"} />
                <Mini label="Omsetning" value={formatMoney(lead.financials?.revenue)} />
                <Mini
                  label={
                    lead.selected_contact?.priority === "daily_manager"
                      ? "Daglig leder"
                      : lead.selected_contact?.priority === "chairperson"
                        ? "Styreleder"
                        : "Hovednummer"
                  }
                  value={lead.phone ?? "Ikke funnet"}
                />
                <Mini label="Mail" value={lead.email ?? "Ikke funnet"} />
              </div>
            </button>
          ))}
        </div>

        <aside className="h-fit rounded-[2rem] border border-[#d8c9b0] bg-[#fffaf0] p-5 shadow-sm xl:sticky xl:top-6">
          {selected ? (
            <LeadPanel lead={selected} onPatch={patchLead} onDelete={removeLead} />
          ) : (
            <div className="py-12 text-center text-[#6f5a43]">
              <p className="font-display text-3xl font-black text-[#2b2118]">Velg et lead</p>
              <p className="mt-2 text-sm">Detaljer, status og notater vises her.</p>
            </div>
          )}
        </aside>
      </section>

      {selected && (
        <ReachrCompanyDrawer
          open={false}
          company={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function LeadPanel({
  lead,
  onPatch,
  onDelete,
}: {
  lead: ReachrLead;
  onPatch: (id: string, patch: Partial<Pick<ReachrLead, "status" | "notes" | "email" | "phone" | "last_contacted_at">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(lead.notes ?? "");
    setEmail(lead.email ?? "");
    setPhone(lead.phone ?? "");
  }, [lead.id, lead.notes, lead.email, lead.phone]);

  async function save() {
    setSaving(true);
    try {
      await onPatch(lead.id, { notes, email: email || null, phone: phone || null });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="label-eyebrow">Valgt lead</p>
      <h2 className="mt-2 font-display text-3xl font-black leading-none tracking-[-0.04em] text-[#2b2118]">{lead.name}</h2>
      <p className="mt-2 text-sm text-[#6f5a43]">{lead.industry ?? "Ukjent bransje"} · {lead.address.city ?? "Norge"}</p>

      <div className="mt-5 grid gap-3">
        <label>
          <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">Status</span>
          <select
            value={lead.status}
            onChange={(event) => onPatch(lead.id, { status: event.target.value as ReachrLeadStatus, last_contacted_at: new Date().toISOString() })}
            className="reachr-input"
          >
            {REACHR_LEAD_STATUSES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">Telefon</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} className="reachr-input" placeholder="Legg inn telefon hvis funnet manuelt" />
        </label>
        <label>
          <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">E-post</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} className="reachr-input" placeholder="Legg inn e-post hvis funnet manuelt" />
        </label>
        <label>
          <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.16em] text-[#8b7357]">Notater</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} className="reachr-input min-h-32 resize-y" placeholder="Salgsvinkel, beslutningstaker, neste steg ..." />
        </label>
      </div>

      <div className="mt-5 grid gap-2">
        <button type="button" onClick={save} className="rounded-2xl bg-[#09fe94] px-5 py-3 text-sm font-black text-[#171717] hover:brightness-95">
          {saving ? "Lagrer ..." : "Lagre info"}
        </button>
        <button type="button" onClick={() => setDrawerOpen(true)} className="rounded-2xl border border-[#d8c9b0] bg-[#fff8ea] px-5 py-3 text-sm font-bold text-[#2b2118] hover:bg-[#efe1c7]">
          Åpne komplett firmakort
        </button>
        <button type="button" onClick={() => onDelete(lead.id)} className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-bold text-red-700 hover:bg-red-100">
          Fjern fra mine leads
        </button>
      </div>

      <ReachrCompanyDrawer open={drawerOpen} company={lead} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.75rem] border border-[#d8c9b0] bg-[#fffaf0] p-5 shadow-sm">
      <p className="label-eyebrow">{label}</p>
      <p className="mt-2 font-display text-4xl font-black text-[#2b2118]">{value}</p>
    </div>
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
