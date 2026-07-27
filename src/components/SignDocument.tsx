"use client";

import { useEffect, useState } from "react";
import type { ContractChannel, ContractStatus } from "@/lib/types";
import { formatCurrency, formatDateTime, formatOrgNumber } from "@/lib/format";
import Icon from "./Icon";

interface SignView {
  customer_name: string;
  status: ContractStatus;
  expired: boolean;
  channel: ContractChannel;
  subject: string | null;
  document_body: string | null;
  org_number: string | null;
  advisor_name: string | null;
  total_amount: number | null;
  sent_at: string | null;
  opened_at: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  declined_at: string | null;
  declined_reason: string | null;
  token_expires_at: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; view: SignView };

// Offentlig signeringsside. Ingen innlogging – lenken (token i URL-en) er
// selve autentiseringen. Håndterer alle tilstander: aktiv/utløpt/signert/
// avslått, og lar kunden godkjenne (signere) eller avslå tilbudet.
export default function SignDocument({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [showDecline, setShowDecline] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sign/${token}`)
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Fant ikke dokumentet.");
        if (!cancelled) setState({ kind: "ready", view: j as SignView });
      })
      .catch((e) => {
        if (!cancelled) {
          setState({ kind: "error", message: e instanceof Error ? e.message : "Ukjent feil." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(action: "sign" | "decline") {
    setFormError(null);
    if (action === "sign") {
      if (!name.trim()) return setFormError("Skriv inn fullt navn.");
      if (!confirmChecked) return setFormError("Du må bekrefte at du har lest innholdet.");
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "sign"
            ? { action, name: name.trim(), email: email.trim() || undefined }
            : { action, reason: reason.trim() || undefined },
        ),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Noe gikk galt.");
      setState({ kind: "ready", view: j as SignView });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Ukjent feil.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 px-4 py-10 sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-pop">
        {state.kind === "loading" && (
          <div className="p-10 text-center text-slate-400">Henter dokument …</div>
        )}

        {state.kind === "error" && (
          <div className="p-10 text-center">
            <Icon name="close" size={32} className="mx-auto mb-3 text-red-400" />
            <p className="font-medium text-slate-700">{state.message}</p>
          </div>
        )}

        {state.kind === "ready" && (
          <SignBody
            view={state.view}
            showDecline={showDecline}
            setShowDecline={setShowDecline}
            name={name}
            setName={setName}
            email={email}
            setEmail={setEmail}
            confirmChecked={confirmChecked}
            setConfirmChecked={setConfirmChecked}
            reason={reason}
            setReason={setReason}
            submitting={submitting}
            formError={formError}
            onSign={() => submit("sign")}
            onDecline={() => submit("decline")}
          />
        )}
      </div>
    </div>
  );
}

function SignBody({
  view,
  showDecline,
  setShowDecline,
  name,
  setName,
  email,
  setEmail,
  confirmChecked,
  setConfirmChecked,
  reason,
  setReason,
  submitting,
  formError,
  onSign,
  onDecline,
}: {
  view: SignView;
  showDecline: boolean;
  setShowDecline: (v: boolean) => void;
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  confirmChecked: boolean;
  setConfirmChecked: (v: boolean) => void;
  reason: string;
  setReason: (v: string) => void;
  submitting: boolean;
  formError: string | null;
  onSign: () => void;
  onDecline: () => void;
}) {
  return (
    <div>
      <header className="rounded-t-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-6 sm:px-8">
        <p className="text-sm font-medium text-brand-100">{view.customer_name}</p>
        <h1 className="text-xl font-bold text-white">{view.subject || "Tilbud til signering"}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-100">
          {view.org_number && <span>Org.nr {formatOrgNumber(view.org_number)}</span>}
          {view.advisor_name && <span>Rådgiver: {view.advisor_name}</span>}
          {view.total_amount != null && <span>Totalt: {formatCurrency(view.total_amount)}</span>}
        </div>
      </header>

      <div className="px-6 py-6 sm:px-8">
        {view.status === "signed" && (
          <StatusBanner
            tone="success"
            title="Signert"
            detail={`Signert av ${view.signed_by_name ?? "kunde"} – ${formatDateTime(view.signed_at)}. En bekreftelse er sendt på e-post.`}
          />
        )}
        {view.status === "declined" && (
          <StatusBanner
            tone="danger"
            title="Avslått"
            detail={`Avslått ${formatDateTime(view.declined_at)}${view.declined_reason ? `: «${view.declined_reason}»` : "."}`}
          />
        )}
        {view.status !== "signed" && view.status !== "declined" && view.expired && (
          <StatusBanner
            tone="warning"
            title="Lenken er utløpt"
            detail="Ta kontakt med selgeren din for å få tilsendt en ny lenke."
          />
        )}

        <div
          className="thin-scroll mt-4 max-h-[26rem] overflow-y-auto rounded-xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-700"
          dangerouslySetInnerHTML={{
            __html: view.document_body || "<p style='color:#94a3b8'>(ingen innhold)</p>",
          }}
        />

        {view.status !== "signed" && view.status !== "declined" && !view.expired && (
          <div className="mt-5 space-y-4">
            {formError && <p className="text-sm text-red-600">{formError}</p>}

            {!showDecline ? (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Fullt navn"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-post (valgfritt)"
                    type="email"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                <label className="flex items-start gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={confirmChecked}
                    onChange={(e) => setConfirmChecked(e.target.checked)}
                    className="mt-0.5"
                  />
                  Jeg har lest innholdet over og godtar vilkårene.
                </label>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    onClick={() => setShowDecline(true)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Avslå
                  </button>
                  <button
                    onClick={onSign}
                    disabled={submitting}
                    className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {submitting ? "Signerer …" : "Godkjenn og signer"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Hvorfor avslår du tilbudet? (valgfritt)"
                  rows={3}
                  className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    onClick={() => setShowDecline(false)}
                    className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Tilbake
                  </button>
                  <button
                    onClick={onDecline}
                    disabled={submitting}
                    className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {submitting ? "Sender …" : "Bekreft avslag"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBanner({
  tone,
  title,
  detail,
}: {
  tone: "success" | "danger" | "warning";
  title: string;
  detail: string;
}) {
  const styles = {
    success: "bg-green-50 text-green-800 ring-green-200",
    danger: "bg-red-50 text-red-800 ring-red-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
  }[tone];
  return (
    <div className={`mb-1 rounded-xl p-4 text-sm ring-1 ${styles}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{detail}</p>
    </div>
  );
}
