"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

type Message = {
  role: "user" | "assistant";
  text: string;
  sources?: Array<{ label: string; href?: string }>;
  period?: string;
};

type StoredMessage = {
  id: string;
  role: Message["role"];
  content: string;
  sources?: Message["sources"];
  period?: string;
};

const EXAMPLES = [
  "Hva ble sagt til denne kunden sist?",
  "Hvor mye har vi solgt de siste 2 ukene?",
  "Hvor mange tilbud har vi sendt denne uka?",
  "Hvilken selger har høyest closing rate?",
];

export default function CrmAiAssistant() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/crm-ai", { cache: "no-store" });
        const payload = await response.json() as { messages?: StoredMessage[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Kunne ikke hente samtalehistorikken.");
        if (active) {
          setMessages((payload.messages ?? []).map((message) => ({
            role: message.role,
            text: message.content,
            sources: message.sources,
            period: message.period,
          })));
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Kunne ikke hente samtalehistorikken.");
      } finally {
        if (active) setHistoryLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    const value = question.trim();
    if (!value || loading) return;
    setMessages((items) => [...items, { role: "user", text: value }]);
    setQuestion("");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/crm-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value }),
      });
      const payload = await response.json() as {
        answer?: string;
        error?: string;
        sources?: Message["sources"];
        period?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Kunne ikke hente svar.");
      setMessages((items) => [...items, {
        role: "assistant",
        text: payload.answer ?? "Ingen svar.",
        sources: payload.sources,
        period: payload.period,
      }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kunne ikke hente svar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100dvh-12rem)] gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <section className="flex min-h-[42rem] flex-col overflow-hidden rounded-[1.75rem] border border-[#d8c9b0] bg-[#fffaf0]/90 shadow-[0_24px_70px_rgba(61,44,24,0.08)]">
        <div className="border-b border-[#d8c9b0] px-5 py-4 sm:px-7">
          <p className="label-eyebrow">Kun for ledelsen</p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-[-0.04em] text-[#2b2118] sm:text-5xl">Spør CRM</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#6b6660]">
            Still spørsmål om salg, tilbud, oppfølging og kundehistorikk. Svarene beregnes fra CRM-dataene.
          </p>
        </div>

        <div className="thin-scroll flex-1 space-y-4 overflow-y-auto p-4 sm:p-7" aria-live="polite">
          {historyLoading && <p className="text-sm font-semibold text-[#6b6660]">Henter samtalehistorikk …</p>}
          {!historyLoading && !messages.length && (
            <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#171717] text-[#09fe94]">
                <Icon name="sparkles" size={25} />
              </span>
              <h2 className="mt-5 font-display text-3xl font-bold text-[#2b2118]">Hva vil du vite?</h2>
              <p className="mt-2 max-w-md text-sm text-[#756d64]">
                AI-en kan lese relevante CRM-data, men kan ikke endre eller slette noe.
              </p>
            </div>
          )}
          {messages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={`max-w-3xl rounded-2xl px-4 py-3 ${message.role === "user" ? "ml-auto bg-[#171717] text-white" : "border border-[#d8c9b0] bg-white text-[#2b2118]"}`}
            >
              <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
              {message.period && message.role === "assistant" && (
                <p className="mt-3 text-xs font-semibold text-[#8d806e]">Dataperiode: {message.period}</p>
              )}
              {!!message.sources?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.sources.map((source) => source.href ? (
                    <Link key={source.label} href={source.href} className="rounded-full bg-[#e8f7ef] px-3 py-1 text-xs font-bold text-[#087a4b] hover:bg-[#d5f1e2]">
                      {source.label}
                    </Link>
                  ) : <span key={source.label}>{source.label}</span>)}
                </div>
              )}
            </article>
          ))}
          {loading && <p className="text-sm font-semibold text-[#6b6660]">Søker i CRM-dataene …</p>}
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        </div>

        <form onSubmit={ask} className="border-t border-[#d8c9b0] bg-white p-3 sm:p-4">
          <div className="flex items-end gap-2 rounded-2xl border border-[#b8dcca] px-3 py-2 focus-within:ring-2 focus-within:ring-[#00a965]/20">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask();
                }
              }}
              rows={2}
              maxLength={600}
              placeholder="Spør om kunder, salg eller oppfølging …"
              className="min-h-12 flex-1 resize-none bg-transparent py-2 text-sm outline-none"
            />
            <button type="submit" disabled={historyLoading || loading || !question.trim()} className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-[#171717] text-[#09fe94] transition hover:scale-105 disabled:opacity-35" aria-label="Send spørsmål">
              <Icon name="send" size={18} />
            </button>
          </div>
        </form>
      </section>

      <aside className="space-y-3">
        <div className="rounded-[1.5rem] border border-[#d8c9b0] bg-[#fffaf0]/80 p-5">
          <p className="label-eyebrow">Prøv å spørre</p>
          <div className="mt-3 space-y-2">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => setQuestion(example)} className="w-full rounded-xl border border-[#d8c9b0] bg-white px-3 py-2.5 text-left text-sm font-semibold text-[#2b2118] transition hover:border-[#00a965] hover:bg-[#eafff5]">
                {example}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-[#b8dcca] bg-[#eafff5] p-5 text-sm text-[#315c46]">
          <p className="font-bold">Sikkert datagrunnlag</p>
          <p className="mt-2 leading-6">Tall beregnes i CRM-et. AI-en brukes til å forstå spørsmålet og oppsummere tekst, og får aldri skrive til databasen.</p>
        </div>
      </aside>
    </div>
  );
}
