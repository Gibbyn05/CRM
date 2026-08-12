import type { Metadata } from "next";
import Link from "next/link";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Custom salgsdashboard | Bygget for teamet deres",
  description:
    "Vi bygger et salgsdashboard rundt teamet deres, og dere kan tilpasse det videre når arbeidsflyten endrer seg.",
};

const DemoButton = ({ compact = false }: { compact?: boolean }) => (
  <a
    className={compact ? styles.navCta : styles.primaryCta}
    href="mailto:post@reachr.no?subject=Jeg ønsker en demo av plattformen"
  >
    Bestill demo <span aria-hidden="true">↗</span>
  </a>
);

const Icon = ({
  name,
}: {
  name: "layout" | "wand" | "shield" | "chart" | "phone" | "pipeline" | "users" | "lock";
}) => {
  const paths = {
    layout: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M4 10h16M10 10v9" />
      </>
    ),
    wand: (
      <>
        <path d="m15 4 1.5 3L20 8.5l-3.5 1.4L15 13l-1.5-3.1L10 8.5 13.5 7z" />
        <path d="M4 20 13 11" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5.5c0 4.4 2.8 7.3 7 9 4.2-1.7 7-4.6 7-9V6z" />
        <path d="m9.2 12 1.8 1.8 4-4" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V8M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    phone: (
      <path d="M7.2 3.5 10 7.7 8.2 9.5c1.4 2.7 3.6 4.9 6.3 6.3l1.8-1.8 4.2 2.8-.8 2.8c-.3 1.1-1.4 1.7-2.5 1.5C9.7 19.8 4.2 14.3 2.9 6.8c-.2-1.1.4-2.2 1.5-2.5z" />
    ),
    pipeline: (
      <>
        <circle cx="5" cy="6" r="2" />
        <circle cx="19" cy="12" r="2" />
        <circle cx="8" cy="19" r="2" />
        <path d="M7 6h5a3 3 0 0 1 3 3 3 3 0 0 0 3 3M17.5 14c-1.1 3-3.5 5-7.5 5" />
      </>
    ),
    users: (
      <>
        <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
        <circle cx="9.5" cy="7.5" r="3.5" />
        <path d="M21 20v-1a3.5 3.5 0 0 0-2.8-3.4M16.5 4.3a3.4 3.4 0 0 1 0 6.4" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
};

const heroFrames = [
  { title: "Dashboard", copy: "Widgets, farger og rekkefølge", metric: "100%" },
  { title: "Pipeline", copy: "Steg, roller og salgsflyt", metric: "12" },
  { title: "Team", copy: "Tilgang per selger og leder", metric: "4" },
  { title: "Kontrakt", copy: "Maler og signering samlet", metric: "AI" },
  { title: "Live", copy: "Samtaler, filer og aktivitet", metric: "Nå" },
  { title: "Analyse", copy: "Resultater per selger og periode", metric: "47" },
];

const stats = [
  ["01", "Ferdig oppsett", "Vi bygger første versjon rundt kundens team, prosess og mål."],
  ["02", "Full kontroll", "Kunden kan endre sider, widgets, farger, roller og rekkefølge videre selv."],
  ["03", "Eget arbeidsområde", "Hver organisasjon får isolerte data, egne brukere og sitt eget dashboard."],
  ["04", "Kan vokse", "Oppsettet kan justeres når teamet, produktene eller salgsprosessen endrer seg."],
];

const features = [
  {
    icon: "layout" as const,
    title: "Custom dashboard",
    copy: "Vi setter opp dashboardet slik kunden faktisk skal bruke det. Ikke som en standardmal alle må presse seg inn i.",
  },
  {
    icon: "wand" as const,
    title: "Endres underveis",
    copy: "Kunden kan flytte widgets, skjule sider, endre farger, endre rekkefølge og tilpasse arbeidsflyten etter hvert.",
  },
  {
    icon: "pipeline" as const,
    title: "Egen salgsprosess",
    copy: "Pipeline, kundereise, kontraktsmaler og rapporter kan bygges rundt produktene og måten teamet selger på.",
  },
  {
    icon: "shield" as const,
    title: "Adskilt per kunde",
    copy: "Hver kunde får sin egen organisasjon med isolerte brukere, filer, kunder, salg, kontrakter og sanntidsdata.",
  },
];

const workflow = [
  ["Kartlegg", "Vi går gjennom roller, mål, salgsflyt og hvilke sider teamet faktisk trenger."],
  ["Bygg", "Vi setter opp dashboard, widgets, pipeline, roller, moduler og kundevisninger."],
  ["Lever", "Teamet får en ferdig arbeidsflate med riktig struktur fra dag én."],
  ["Juster", "Oppsettet kan endres senere uten at kunden må starte på nytt."],
];

const feedback = [
  "Vi trenger et dashboard som er laget for vårt team, ikke et generisk system.",
  "Selgere skal se sin egen arbeidsflate, ledere skal se hele teamet.",
  "Vi må kunne endre oppsettet når salgsprosessen endrer seg.",
  "Dashboard, kontrakter, pipeline og aktivitet må henge sammen.",
];

function HeroPreview() {
  return (
    <div className={styles.heroStack} aria-label="Eksempler på tilpassede dashboardmoduler">
      {heroFrames.map((frame, index) => (
        <article className={styles.heroFrame} style={{ "--i": index } as React.CSSProperties} key={frame.title}>
          <div>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{frame.metric}</strong>
          </div>
          <h3>{frame.title}</h3>
          <p>{frame.copy}</p>
        </article>
      ))}
    </div>
  );
}

function ProductPanel() {
  return (
    <div className={styles.productPanel}>
      <div className={styles.panelChrome}>
        <span /><span /><span />
        <p>[ DERES-DASHBOARD.NO ]</p>
      </div>
      <div className={styles.panelBody}>
        <aside>
          {["Oversikt", "Kunder", "Salg", "Pipeline", "Kontrakter"].map((item, index) => (
            <div className={index === 0 ? styles.activePanelLink : ""} key={item}>
              <span>{index + 1}</span>
              {item}
            </div>
          ))}
        </aside>
        <section>
          <div className={styles.panelHeader}>
            <p>// CUSTOM DASHBOARD</p>
            <button>Endre oppsett</button>
          </div>
          <div className={styles.panelMetrics}>
            <article><span>Samtaler</span><strong>47</strong></article>
            <article><span>Møter</span><strong>6</strong></article>
            <article><span>Pipeline</span><strong>284k</strong></article>
          </div>
          <div className={styles.panelGrid}>
            <article className={styles.panelChart}>
              <header><b>Aktivitet</b><span>Live</span></header>
              <div>{[42, 58, 39, 76, 61, 88, 70].map((height, index) => <i className={index === 5 ? styles.hotBar : ""} style={{ height: `${height}%` }} key={index} />)}</div>
            </article>
            <article className={styles.panelFeed}>
              <header><b>Siste aktivitet</b><span>Oppdatert</span></header>
              {["Tilbud sendt", "Møte booket", "Status endret"].map((item) => <p key={item}>{item}<span>Nå</span></p>)}
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.navWrap}>
        <nav className={styles.nav} aria-label="Hovedmeny">
          <Link href="/" className={styles.logo} aria-label="Plattformens forside">
            <span>+</span> DIN PLATTFORM
          </Link>
          <div className={styles.navLinks}>
            <a href="#oppsett">Oppsett</a>
            <a href="#tilpasning">Tilpasning</a>
            <a href="#leveranse">Leveranse</a>
          </div>
          <div className={styles.navActions}>
            <Link href="/login">Logg inn</Link>
            <DemoButton compact />
          </div>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.gridMark} />
        <div className={styles.cornerMarks} aria-hidden="true" />
        <div className={styles.heroGlow} />
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>// CUSTOM SALES DASHBOARD</p>
          <h1>
            Vi bygger dashboardet.
            <span>Dere styrer det videre.</span>
          </h1>
          <p>
            Et salgsdashboard laget rundt teamet, prosessen og målene deres. Vi setter opp første versjon, og dere kan endre sider, widgets, farger, roller og arbeidsflyt når dere vil.
          </p>
          <div className={styles.heroActions}>
            <DemoButton />
            <a href="#oppsett">Se oppsettet</a>
          </div>
          <div className={styles.heroBadges}>
            <span>Ferdig bygget for kunden</span>
            <span>Tilpasses underveis</span>
            <span>Eget isolert teamområde</span>
          </div>
        </div>
        <HeroPreview />
      </section>

      <section id="oppsett" className={styles.stats}>
        <div className={styles.sectionIntro}>
          <p>// LEVERANSE</p>
          <h2>Ikke en tom plattform. Et ferdig dashboard kunden kan bruke.</h2>
        </div>
        <div className={styles.statsGrid}>
          {stats.map(([number, title, copy]) => (
            <article key={title}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="tilpasning" className={styles.features}>
        <div className={styles.sectionIntro}>
          <p>// TILPASNING</p>
          <h2>Alt som påvirker salgsdagen kan formes rundt kunden.</h2>
        </div>
        <div className={styles.featureGrid}>
          {features.map((feature) => (
            <article key={feature.title}>
              <Icon name={feature.icon} />
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.previewSection}>
        <div className={styles.sectionIntro}>
          <p>// DASHBOARD PREVIEW</p>
          <h2>Samme system. Forskjellig oppsett for hvert team.</h2>
        </div>
        <ProductPanel />
      </section>

      <section id="leveranse" className={styles.workflow}>
        <div className={styles.sectionIntro}>
          <p>// FLOW</p>
          <h2>Fra kartlegging til et dashboard som kan utvikles videre.</h2>
        </div>
        <div className={styles.workflowGrid}>
          {workflow.map(([title, copy], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.feedback}>
        <div className={styles.sectionIntro}>
          <p>// KUNDEBEHOV</p>
          <h2>Typiske krav vi bygger dashboardet rundt.</h2>
        </div>
        <div className={styles.feedbackTrack}>
          {[...feedback, ...feedback].map((quote, index) => (
            <article key={`${quote}-${index}`}>
              <span>{index % 2 === 0 ? "TEAM" : "LEDER"}</span>
              <p>"{quote}"</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.security}>
        <Icon name="lock" />
        <div>
          <p>// ORGANISASJON</p>
          <h2>Hver kunde får sitt eget arbeidsområde.</h2>
        </div>
        <p>
          Brukere, kunder, filer, kontrakter, salg, teamstatus og sanntid holdes adskilt per organisasjon. Det betyr at samme plattform kan leveres til flere kunder uten at teamene blandes.
        </p>
      </section>

      <section className={styles.finalCta}>
        <p>// DEMO</p>
        <h2>Se hvordan dashboardet kan bygges for deres team.</h2>
        <div>
          <DemoButton />
          <Link href="/login">Allerede kunde? Logg inn</Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <Link href="/" className={styles.logo}><span>+</span> DIN PLATTFORM</Link>
          <p>Custom salgsdashboard bygget rundt kundens team, prosess og mål.</p>
        </div>
        <nav>
          <a href="#oppsett">Oppsett</a>
          <a href="#tilpasning">Tilpasning</a>
          <a href="#leveranse">Leveranse</a>
          <Link href="/login">Logg inn</Link>
        </nav>
        <small>© {new Date().getFullYear()}</small>
      </footer>
    </main>
  );
}
