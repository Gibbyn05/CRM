type GitHubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
};

type ReleaseNote = {
  sha: string;
  url: string;
  title: string;
  area: string;
  author: string;
  date: Date;
};

const REPOSITORY = "Gibbyn05/CRM";
const BRANCH = "claude/sales-dashboard-callcenter-22x5kt";

function classify(message: string): string {
  const explicit = message.match(/^release\(([^)]+)\):/i)?.[1];
  if (explicit) return explicit;
  const text = message.toLowerCase();
  if (/reachr|lead|1881|phone|contact/.test(text)) return "Reachr";
  if (/contract|sign|offer|agreement/.test(text)) return "Kontrakter";
  if (/customer|activity|file/.test(text)) return "Kunder";
  if (/dashboard|widget/.test(text)) return "Dashboard";
  if (/calendar|reminder|task/.test(text)) return "Kalender";
  if (/fiken|invoice|payment|income|commission/.test(text)) return "Regnskap";
  if (/leaderboard|team analysis|seller/.test(text)) return "Team";
  if (/navigation|sidebar|page|layout|ui/.test(text)) return "Grensesnitt";
  return "Reachr";
}

function cleanTitle(message: string): string {
  const firstLine = message.split("\n")[0].trim();
  const explicit = firstLine.replace(/^release(?:\([^)]+\))?:\s*/i, "");
  const prefixes: Array<[RegExp, string]> = [
    [/^add\s+/i, "Ny: "],
    [/^fix\s+/i, "Rettet: "],
    [/^improve\s+/i, "Forbedret: "],
    [/^update\s+/i, "Oppdatert: "],
    [/^remove\s+/i, "Fjernet: "],
    [/^make\s+/i, "Forbedret: "],
  ];
  for (const [pattern, replacement] of prefixes) {
    if (pattern.test(explicit)) return explicit.replace(pattern, replacement);
  }
  return explicit;
}

async function getRecentUpdates(): Promise<ReleaseNote[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPOSITORY}/commits?sha=${encodeURIComponent(BRANCH)}&since=${encodeURIComponent(since)}&per_page=100`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 300 },
      },
    );
    if (!response.ok) throw new Error(`GitHub svarte ${response.status}`);
    const commits = (await response.json()) as GitHubCommit[];
    return commits.flatMap((item) => {
      const date = item.commit.author?.date;
      if (!date || item.commit.message.startsWith("Merge ")) return [];
      return [{
        sha: item.sha.slice(0, 7),
        url: item.html_url,
        title: cleanTitle(item.commit.message),
        area: classify(item.commit.message),
        author: item.commit.author?.name || "Reachr-teamet",
        date: new Date(date),
      }];
    });
  } catch {
    return [];
  }
}

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export const dynamic = "force-dynamic";

export default async function UpdatesPage() {
  const updates = await getRecentUpdates();
  const groups = new Map<string, ReleaseNote[]>();
  for (const update of updates) {
    const key = dayKey(update.date);
    groups.set(key, [...(groups.get(key) ?? []), update]);
  }

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <header className="relative overflow-hidden rounded-[2rem] border border-[#d8c9b0] bg-[#171717] px-6 py-10 text-[#fffaf0] shadow-[0_28px_80px_rgba(43,33,24,0.16)] sm:px-10 sm:py-14">
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full border border-[#09fe94]/30" />
        <div className="absolute -right-4 -top-8 h-44 w-44 rounded-full border border-[#09fe94]/50" />
        <div className="relative max-w-3xl">
          <p className="mb-5 flex items-center gap-3 text-xs font-black uppercase tracking-[0.24em] text-[#09fe94]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#09fe94]" />
            Automatisk produktjournal · siste 7 dager
          </p>
          <h1 className="font-display text-5xl font-bold leading-[0.95] sm:text-7xl">Dette er nytt i Reachr</h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[#d8d0c4] sm:text-lg">
            Oppdateres automatisk fra GitHub etter hver push. Nyeste forbedringer står øverst.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
            <span className="rounded-full bg-[#09fe94] px-4 py-2 text-[#171717]">{updates.length} oppdateringer</span>
            <span className="rounded-full border border-white/20 px-4 py-2 text-white/80">Oppdateres innen 5 minutter</span>
          </div>
        </div>
      </header>

      {updates.length === 0 ? (
        <div className="mt-10 rounded-[1.75rem] border border-[#dfd2bd] bg-[#fffaf0] p-10 text-center">
          <h2 className="font-display text-2xl font-bold text-[#2b2118]">Ingen oppdateringer kunne hentes</h2>
          <p className="mt-2 text-sm text-[#70685f]">GitHub kan være midlertidig utilgjengelig. Prøv igjen om noen minutter.</p>
        </div>
      ) : (
        <div className="mt-12 space-y-14">
          {[...groups.entries()].map(([key, notes]) => (
            <section key={key} className="grid gap-6 md:grid-cols-[12rem_1fr]">
              <div className="md:sticky md:top-6 md:self-start">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8a7961]">{notes.length} endringer</p>
                <h2 className="mt-2 font-display text-3xl font-bold capitalize text-[#2b2118]">{dayLabel(notes[0].date)}</h2>
              </div>
              <div className="overflow-hidden rounded-[1.75rem] border border-[#dfd2bd] bg-[#fffaf0]/75 shadow-[0_20px_55px_rgba(43,33,24,0.06)]">
                {notes.map((update, index) => (
                  <a key={update.sha} href={update.url} target="_blank" rel="noreferrer" className="group grid gap-3 border-b border-[#e8dece] p-5 transition-colors last:border-b-0 hover:bg-[#f7ffe9] sm:grid-cols-[2.25rem_1fr_auto] sm:items-start sm:gap-4 sm:p-6">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cdbfa9] bg-white font-mono text-xs font-bold text-[#7a6b55] transition group-hover:border-[#09c97a] group-hover:bg-[#09fe94] group-hover:text-[#171717]">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3 className="text-base font-bold text-[#2b2118] sm:text-lg">{update.title}</h3>
                      <p className="mt-1 text-xs text-[#93887a]">{update.author} · {update.sha}</p>
                    </div>
                    <span className="w-fit rounded-full border border-[#dfd2bd] bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#85745e]">{update.area}</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
