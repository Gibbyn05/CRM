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
  description: string;
  impact: string;
  area: string;
  author: string;
  date: Date;
};

const REPOSITORY = "Gibbyn05/CRM";
const BRANCH = "claude/sales-dashboard-callcenter-22x5kt";

const CUSTOMER_DETAILS: Array<{
  match: RegExp;
  title: string;
  description: string;
  impact: string;
}> = [
  { match: /editorial photos|dagsavis placeholders/i, title: "Nye bilder i Dagsavis", description: "De enkle plassholderillustrasjonene er erstattet med sju profesjonelle svart-hvitt-bilder som viser ekte situasjoner fra salgshverdagen.", impact: "Dagsavis oppleves mer gjennomarbeidet og motiverende, samtidig som et nytt motiv vises automatisk hver dag." },
  { match: /customer notes across tab/i, title: "Notater forsvinner ikke ved fanebytte", description: "Aktivitetsloggen henter nå alltid den nyeste versjonen fra databasen når fanen åpnes, og bekrefter lagring før skrivefeltet tømmes.", impact: "Notater blir liggende på kunden og er tilgjengelige igjen med én gang, også etter at du har byttet fane." },
  { match: /customer journey to managers/i, title: "Kundereise er begrenset til ledere", description: "Kundereise og tilhørende menyvalg vises nå bare for lederprofiler.", impact: "Selgere får en enklere meny, mens ledere beholder verktøyene de trenger for å administrere kundereisen." },
  { match: /manager tabs from seller/i, title: "Lederfaner er skjult for selgere", description: "Menyinnstillingene filtrerer nå bort sider som bare ledere har tilgang til, i stedet for å vise utilgjengelige valg.", impact: "Hver bruker ser bare relevante sider for sin rolle, både i menyen og når menyen tilpasses." },
  { match: /automate product update log/i, title: "Oppdateringsloggen oppdateres automatisk", description: "Denne siden henter nå de siste endringene direkte fra Media Norge CRM sin utviklingshistorikk og organiserer dem etter dato og produktområde.", impact: "Kunder kan følge utviklingen fortløpende uten at endringsloggen må oppdateres manuelt." },
  { match: /product updates page/i, title: "Ny side for produktoppdateringer", description: "Det er opprettet en egen oversikt som samler de siste forbedringene i Media Norge CRM på ett sted.", impact: "Det blir enklere å se hva som er levert, når det ble levert og hvilken del av løsningen som er forbedret." },
  { match: /realtime customer subscriptions/i, title: "Mer stabil live-oppdatering", description: "Live-abonnementene for kundedata og filer bruker nå en stabil tilkobling gjennom hele sidevisningen.", impact: "Endringer fra kollegaer dukker opp raskere og mer pålitelig uten at siden må lastes inn på nytt." },
  { match: /live customer updates and lead reservations/i, title: "Live kundedata og tryggere leadfordeling", description: "Filer og kundeinformasjon synkroniseres mellom brukere, samtidig som Media Norge CRM reserverer et lead når en selger legger det til.", impact: "Kollegaer ser oppdateringer fortløpende, og risikoen for at to selgere tar samme lead blir redusert." },
  { match: /contract template placeholders/i, title: "Dynamiske felter i kontraktsmaler", description: "Kontraktsmaler kan inneholde felter som kundenavn, organisasjonsnummer, produkt, pris og dato. Media Norge CRM fyller inn verdiene fra CRM-dataene.", impact: "Selgere bruker mindre tid på manuell utfylling og får mer konsistente kontrakter." },
  { match: /contract template workflow/i, title: "Ny arbeidsflyt for kontraktsmaler", description: "Organisasjonen kan administrere flere kontraktsmaler og bruke CRM-data til å lage et ferdig utkast for riktig kunde og produkt.", impact: "Veien fra vunnet salg til kontrollert kontrakt blir kortere og krever mindre dobbeltarbeid." },
  { match: /legacy contract document layout/i, title: "Kontrakter følger kjent dokumentoppsett", description: "Kontraktsvisningen er bygget om med tydelig kundeinformasjon, produktlinjer, priser, vilkår og signeringsområde.", impact: "Både selger og kunde får et mer gjenkjennelig og profesjonelt kontraktsdokument." },
  { match: /activity composer visible|reserve space for activity composer/i, title: "Skrivefeltet er alltid tilgjengelig", description: "Aktivitetsloggen reserverer nå fast plass til skrivefeltet nederst, uavhengig av hvor lang kundehistorikken er.", impact: "Du kan alltid skrive et nytt notat uten å lete etter feltet eller rulle til en bestemt posisjon." },
  { match: /customer detail workspace layout/i, title: "Kundekortet har fått en tydeligere arbeidsflate", description: "Kontaktinformasjon og aktivitetslogg er samlet i én balansert visning, med mer plass til den kronologiske kundehistorikken.", impact: "Det blir raskere å orientere seg og jobbe med kunden uten unødvendige sideskift." },
  { match: /customer activity and payment workflows/i, title: "Bedre oversikt over aktivitet og betaling", description: "Kundeaktivitet og betalingsstatus er tydeligere koblet til salg, avtaler og oppfølging.", impact: "Selgere ser raskere hva som har skjedd, hva som er betalt og hva som fortsatt krever oppfølging." },
];

function customerCopy(message: string, area: string) {
  const rule = CUSTOMER_DETAILS.find((entry) => entry.match.test(message));
  if (rule) return rule;

  const lines = message.split("\n").map((line) => line.trim()).filter(Boolean);
  const customerLine = lines.find((line) => /^kunde:/i.test(line));
  const impactLine = lines.find((line) => /^effekt:/i.test(line));
  const description = customerLine?.replace(/^kunde:\s*/i, "") ||
    `Vi har forbedret ${area.toLowerCase()} for å gjøre arbeidsflyten tydeligere, mer stabil og enklere å bruke i det daglige.`;
  const impact = impactLine?.replace(/^effekt:\s*/i, "") ||
    "Endringen reduserer unødvendige steg og gir en mer forutsigbar opplevelse for brukerne.";
  return { title: cleanTitle(message), description, impact };
}

function classify(message: string): string {
  const explicit = message.match(/^release\(([^)]+)\):/i)?.[1];
  if (explicit) return explicit;
  const text = message.toLowerCase();
  if (/reachr|lead|1881|phone|contact/.test(text)) return "Media Norge CRM";
  if (/contract|sign|offer|agreement/.test(text)) return "Kontrakter";
  if (/customer|activity|file/.test(text)) return "Kunder";
  if (/dashboard|widget/.test(text)) return "Dashboard";
  if (/calendar|reminder|task/.test(text)) return "Kalender";
  if (/fiken|invoice|payment|income|commission/.test(text)) return "Regnskap";
  if (/leaderboard|team analysis|seller/.test(text)) return "Team";
  if (/navigation|sidebar|page|layout|ui/.test(text)) return "Grensesnitt";
  return "Media Norge CRM";
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
      const area = classify(item.commit.message);
      const copy = customerCopy(item.commit.message, area);
      return [{
        sha: item.sha.slice(0, 7),
        url: item.html_url,
        title: copy.title,
        description: copy.description,
        impact: copy.impact,
        area,
        author: item.commit.author?.name || "Media Norge CRM-teamet",
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
          <h1 className="font-display text-5xl font-bold leading-[0.95] sm:text-7xl">Dette er nytt i Media Norge CRM</h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[#d8d0c4] sm:text-lg">
            Her kan dere følge hvordan Media Norge CRM utvikles fra uke til uke. Hvert punkt forklarer både hva vi har endret og hvilken praktisk verdi det gir dere.
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
                  <article key={update.sha} className="group grid gap-3 border-b border-[#e8dece] p-5 transition-colors last:border-b-0 hover:bg-[#f7ffe9] sm:grid-cols-[2.25rem_1fr_auto] sm:items-start sm:gap-4 sm:p-7">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cdbfa9] bg-white font-mono text-xs font-bold text-[#7a6b55] transition group-hover:border-[#09c97a] group-hover:bg-[#09fe94] group-hover:text-[#171717]">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3 className="text-base font-bold text-[#2b2118] sm:text-lg">{update.title}</h3>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#62594f]">{update.description}</p>
                      <div className="mt-4 max-w-3xl border-l-2 border-[#09c97a] pl-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#087a4b]">Dette betyr for dere</p>
                        <p className="mt-1 text-sm leading-6 text-[#756b60]">{update.impact}</p>
                      </div>
                      <a href={update.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-xs font-bold text-[#8a7961] underline decoration-[#cdbfa9] underline-offset-4 hover:text-[#087a4b]">Se teknisk endring</a>
                    </div>
                    <span className="w-fit rounded-full border border-[#dfd2bd] bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#85745e]">{update.area}</span>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
