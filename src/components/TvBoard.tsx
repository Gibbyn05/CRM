"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LiveAgentRow } from "@/lib/types";
import AgentCard from "./AgentCard";

const REPOSITION_MS = 500;
const REPOSITION_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const STATUS_ORDER: Record<string, number> = {
  in_call: 0,
  available: 1,
  not_in_call: 2,
  offline: 3,
};

// TV-tavle med automatisk oppdatering (polling hvert 5. sekund). Designet for
// storskjerm: store kort, høy kontrast. Ingen innlogging.
interface SaleEvent {
  id: string;
  agent_name: string;
  song_url: string | null;
  song_start?: number;
  song_duration?: number | null;
}

export default function TvBoard() {
  const [agents, setAgents] = useState<LiveAgentRow[]>([]);
  const [now, setNow] = useState(new Date());

  // Salgsfeiring + lyd (kun på TV-en). Autoplay krever at noen aktiverer lyden
  // én gang (kiosk-mus/-fjernkontroll), ellers blokkerer nettleseren lyd.
  const [soundOn, setSoundOn] = useState(false);
  const [celebrate, setCelebrate] = useState<SaleEvent | null>(null);
  const soundOnRef = useRef(false);
  const seenSales = useRef<Set<string>>(new Set());
  const seededSales = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  function enableSound() {
    setSoundOn(true);
  }

  // Lås opp lyd ved første interaksjon hvor som helst på TV-en (mus/tastatur),
  // i tillegg til knappen – da er det vanskeligere å glemme.
  useEffect(() => {
    if (soundOn) return;
    const unlock = () => setSoundOn(true);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [soundOn]);

  // Spill et klipp av sangen: start ved start-sekund, stopp etter varighet.
  function playSong(url: string, start: number, duration: number | null) {
    try {
      audioRef.current?.pause();
      const a = new Audio(url);
      audioRef.current = a;

      const begin = () => {
        try {
          if (start > 0) a.currentTime = start;
        } catch {
          // seeking ikke klart ennå – timeupdate under fanger det opp
        }
        a.play().catch(() => {});
      };

      if (a.readyState >= 1) begin();
      else a.addEventListener("loadedmetadata", begin, { once: true });

      // Stopp etter ønsket varighet (relativt til startpunktet).
      if (duration && duration > 0) {
        const stopAt = start + duration;
        a.addEventListener("timeupdate", () => {
          if (a.currentTime >= stopAt) a.pause();
        });
      }
    } catch {
      // ignorer lydfeil
    }
  }

  // Poll nylige salg og feir nye.
  useEffect(() => {
    let active = true;
    async function loadSales() {
      try {
        const res = await fetch("/api/tv/sales", { cache: "no-store" });
        const json = await res.json();
        const sales: SaleEvent[] = json.sales ?? [];
        if (!active) return;
        // Første runde: marker alt som sett (ingen feiring på oppstart).
        if (!seededSales.current) {
          for (const s of sales) seenSales.current.add(s.id);
          seededSales.current = true;
          return;
        }
        const fresh = sales
          .filter((s) => !seenSales.current.has(s.id))
          .reverse(); // eldst først
        for (const s of fresh) seenSales.current.add(s.id);
        if (fresh.length > 0) {
          const latest = fresh[fresh.length - 1];
          setCelebrate(latest);
          setTimeout(() => setCelebrate(null), 8000);
          if (soundOnRef.current && latest.song_url) {
            playSong(
              latest.song_url,
              latest.song_start ?? 0,
              latest.song_duration ?? null,
            );
          }
        }
      } catch {
        // ignorer transiente feil
      }
    }
    loadSales();
    const t = setInterval(loadSales, 5_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/live-board", { cache: "no-store" });
        const json = await res.json();
        if (active) setAgents(json.agents ?? []);
      } catch {
        // ignorer transiente feil; prøver igjen ved neste intervall
      }
    }

    load();
    const dataTimer = setInterval(load, 5_000);
    const clockTimer = setInterval(() => setNow(new Date()), 1_000);
    return () => {
      active = false;
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...agents].sort((a, b) => {
        const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (s !== 0) return s;
        return a.full_name.localeCompare(b.full_name, "nb");
      }),
    [agents],
  );

  // FLIP: statusendringer omsorterer kortene (in_call flyttes øverst). I
  // stedet for at de hopper til ny posisjon, måler vi forrige plassering og
  // animerer differansen bort – selve poenget med denne tavla er å se
  // hvem som nettopp gikk i samtale.
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const prevRects = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const nextRects = new Map<string, DOMRect>();

    for (const a of sorted) {
      const el = cardRefs.current.get(a.agent_id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      nextRects.set(a.agent_id, rect);

      const prev = prevRects.current.get(a.agent_id);
      if (!prev || reduceMotion) continue;

      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (!dx && !dy) continue;

      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect(); // force reflow før vi fjerner transform
      requestAnimationFrame(() => {
        el.style.transition = `transform ${REPOSITION_MS}ms ${REPOSITION_EASE}`;
        el.style.transform = "";
      });
    }

    prevRects.current = nextRects;
  }, [sorted]);

  const inCall = agents.filter((a) => a.status === "in_call").length;

  return (
    <div className="min-h-screen bg-slate-900 p-8 text-white">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Salgssentral – Live</h1>
          <p className="text-xl text-slate-400">
            {inCall} i samtale nå · {agents.length} agenter
          </p>
        </div>
        <div className="text-right">
          <p className="text-5xl font-bold tabular-nums">
            {now.toLocaleTimeString("nb-NO", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-lg text-slate-400">
            {now.toLocaleDateString("nb-NO", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((a) => (
          <AgentCard
            key={a.agent_id}
            agent={a}
            big
            ref={(el) => {
              if (el) cardRefs.current.set(a.agent_id, el);
              else cardRefs.current.delete(a.agent_id);
            }}
          />
        ))}
      </div>

      {/* Aktiver lyd (én gang) – nødvendig for at nettleseren tillater avspilling */}
      {!soundOn && (
        <button
          onClick={enableSound}
          className="fixed bottom-6 right-6 z-40 rounded-full bg-brand-600 px-5 py-3 text-lg font-semibold text-white shadow-lg hover:bg-brand-700"
        >
          🔊 Aktiver salgslyd
        </button>
      )}

      {/* Salgsfeiring */}
      {celebrate && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="animate-panel-in rounded-3xl bg-gradient-to-br from-emerald-500 to-brand-600 px-16 py-12 text-center shadow-2xl">
            <p className="text-7xl">🎉</p>
            <p className="mt-4 text-3xl font-medium text-white/90">Nytt salg!</p>
            <p className="mt-1 text-6xl font-black text-white">
              {celebrate.agent_name}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
