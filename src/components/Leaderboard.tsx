"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LeaderboardRow, Profile } from "@/lib/types";
import { PERIODS, PERIOD_LABELS, periodRange, type Period } from "@/lib/periods";
import { formatCurrency } from "@/lib/format";
import Avatar from "./Avatar";

type ProfileMap = Record<string, { name: string; avatar_url: string | null }>;

const PODIUM = {
  0: {
    medal: "🥇",
    place: "1. plass",
    label: "Gull",
    card: "border-[#c49a31] bg-[linear-gradient(145deg,#fffdf4_0%,#f8e7aa_100%)] shadow-[0_24px_70px_rgba(126,91,17,0.22)] lg:-translate-y-5",
    ring: "ring-[#d2a83e]",
    chip: "border-[#d2a83e] bg-[#fff8d8] text-[#76530c]",
  },
  1: {
    medal: "🥈",
    place: "2. plass",
    label: "Sølv",
    card: "border-[#a9adb1] bg-[linear-gradient(145deg,#ffffff_0%,#e8eaec_100%)] shadow-[0_18px_55px_rgba(69,76,82,0.15)]",
    ring: "ring-[#aeb3b8]",
    chip: "border-[#b7bbc0] bg-[#f4f5f6] text-[#525a61]",
  },
  2: {
    medal: "🥉",
    place: "3. plass",
    label: "Bronse",
    card: "border-[#ad7049] bg-[linear-gradient(145deg,#fffaf6_0%,#efd0ba_100%)] shadow-[0_18px_55px_rgba(116,67,37,0.16)]",
    ring: "ring-[#b77750]",
    chip: "border-[#c18a67] bg-[#fff1e7] text-[#744124]",
  },
} as const;

export default function Leaderboard() {
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>("uke");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .then(({ data }) => {
        const map: ProfileMap = {};
        for (const p of (data as Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[]) ?? []) {
          map[p.id] = {
            name: p.full_name || p.email || "Ukjent",
            avatar_url: p.avatar_url,
          };
        }
        setProfiles(map);
      });
  }, [supabase]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [start, end] = periodRange(period);
      const { data } = await supabase.rpc("get_leaderboard", {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      });
      if (active) {
        setRows((data as LeaderboardRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [period, supabase]);

  const nameFor = (row: LeaderboardRow) => profiles[row.agent_id]?.name || row.full_name || "Ukjent";
  const topThree = rows.slice(0, 3);
  const remaining = rows.slice(3);

  return (
    <div className="space-y-6">
      <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-[#d8c9b0] bg-[#fffaf0] p-1.5 thin-scroll">
        {PERIODS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition ${
              period === value
                ? "bg-[#171717] text-white shadow-sm"
                : "text-[#6b6660] hover:bg-[#efe3ce] hover:text-[#2b2118]"
            }`}
          >
            {PERIOD_LABELS[value]}
          </button>
        ))}
      </div>

      {topThree.length > 0 && (
        <section aria-label="Topp tre" className="rounded-[2rem] border border-[#d8c9b0] bg-[#f7eedf] px-4 pb-6 pt-11 shadow-[0_18px_60px_rgba(61,44,24,0.08)] sm:px-6 lg:px-8">
          <div className="grid items-end gap-4 md:grid-cols-3 lg:gap-6">
            {[0, 1, 2].map((rank) => {
              const row = topThree[rank];
              if (!row) return <div key={rank} className="hidden md:block" />;
              return (
                <TopSellerCard
                  key={row.agent_id}
                  row={row}
                  rank={rank as 0 | 1 | 2}
                  name={nameFor(row)}
                  avatarUrl={profiles[row.agent_id]?.avatar_url}
                />
              );
            })}
          </div>
        </section>
      )}

      {remaining.length > 0 && (
        <section className="card overflow-hidden" aria-label="Øvrige plasseringer">
          <div className="border-b border-[#d8c9b0] px-5 py-4">
            <h2 className="font-display text-2xl font-bold text-[#2b2118]">Resten av feltet</h2>
            <p className="text-sm text-[#8d806e]">Plasseringer fra fjerdeplass og nedover</p>
          </div>
          <div className="divide-y divide-[#d8c9b0]/70">
            {remaining.map((row, index) => (
              <article key={row.agent_id} className="grid gap-4 px-5 py-4 transition-colors hover:bg-[#fbf7ed] sm:grid-cols-[minmax(13rem,1.4fr)_repeat(4,minmax(4rem,.55fr))_minmax(7rem,.8fr)] sm:items-center">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="w-14 shrink-0 text-xs font-black uppercase tracking-[0.08em] text-[#8d806e]">
                    {index + 4}. plass
                  </span>
                  <Avatar name={nameFor(row)} url={profiles[row.agent_id]?.avatar_url} size={50} />
                  <span className="truncate text-base font-bold text-[#2b2118]">{nameFor(row)}</span>
                </div>
                <ResultMetric label="Samtaler" value={row.calls_count} />
                <ResultMetric label="Møter" value={row.meetings_confirmed} />
                <ResultMetric label="Salg" value={row.sales_count} accent />
                <ResultMetric label="Avslag" value={row.rejections_count} />
                <div className="sm:text-right">
                  <p className="label-eyebrow">Salgsverdi</p>
                  <p className="mt-1 font-display text-xl font-bold tabular-nums text-[#008f52]">{formatCurrency(row.sales_amount)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {!loading && rows.length === 0 && (
        <div className="card px-6 py-14 text-center text-[#6b6660]">Ingen data for perioden.</div>
      )}
      {loading && rows.length === 0 && (
        <div className="card px-6 py-14 text-center text-[#6b6660]">Henter rangeringen …</div>
      )}
    </div>
  );
}

function TopSellerCard({
  row,
  rank,
  name,
  avatarUrl,
}: {
  row: LeaderboardRow;
  rank: 0 | 1 | 2;
  name: string;
  avatarUrl: string | null | undefined;
}) {
  const style = PODIUM[rank];
  const avatarSize = rank === 0 ? 96 : 78;
  return (
    <article className={`relative rounded-[1.75rem] border p-5 text-center transition-transform duration-300 hover:-translate-y-1 ${style.card} ${rank === 0 ? "md:order-2" : rank === 1 ? "md:order-1" : "md:order-3"}`}>
      <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 text-5xl drop-shadow-sm" role="img" aria-label={style.label}>
        {style.medal}
      </span>
      <div className={`mx-auto w-fit rounded-full bg-white/85 p-1.5 ring-4 ${style.ring}`}>
        <Avatar name={name} url={avatarUrl} size={avatarSize} />
      </div>
      <span className={`mt-5 inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${style.chip}`}>
        {style.place} · {style.label}
      </span>
      <h2 className={`mt-3 truncate font-display font-bold text-[#2b2118] ${rank === 0 ? "text-3xl" : "text-2xl"}`}>{name}</h2>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums text-[#008f52]">{formatCurrency(row.sales_amount)}</p>
      <p className="label-eyebrow mt-1">Salgsverdi</p>
      <div className="mt-5 grid grid-cols-3 divide-x divide-[#8d806e]/20 rounded-2xl border border-white/70 bg-white/55 py-3">
        <PodiumMetric label="Samtaler" value={row.calls_count} />
        <PodiumMetric label="Møter" value={row.meetings_confirmed} />
        <PodiumMetric label="Salg" value={row.sales_count} />
      </div>
    </article>
  );
}

function PodiumMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2">
      <p className="font-display text-2xl font-bold tabular-nums text-[#2b2118]">{value}</p>
      <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.11em] text-[#776b5d]">{label}</p>
    </div>
  );
}

function ResultMetric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between sm:block sm:text-right">
      <p className="label-eyebrow">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${accent ? "text-[#008f52]" : "text-[#2b2118]"}`}>{value}</p>
    </div>
  );
}
