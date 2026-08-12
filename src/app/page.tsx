import type { Metadata } from "next";
import Link from "next/link";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Custom salgsdashboard | Bygget for teamet deres",
  description:
    "Vi bygger et salgsdashboard rundt teamet deres, og dere kan tilpasse det videre når arbeidsflyten endrer seg.",
};

const Arrow = () => <span aria-hidden="true">↗</span>;

const Icon = ({ name }: { name: "search" | "phone" | "timeline" | "document" | "chart" | "shield" }) => {
  const paths = {
    search: <><circle cx="10" cy="10" r="5.5" /><path d="m14.5 14.5 5 5" /></>,
    phone: <path d="M7.2 3.5 10 7.7 8.2 9.5c1.4 2.7 3.6 4.9 6.3 6.3l1.8-1.8 4.2 2.8-.8 2.8c-.3 1.1-1.4 1.7-2.5 1.5C9.7 19.8 4.2 14.3 2.9 6.8c-.2-1.1.4-2.2 1.5-2.5l2.8-.8Z" />,
    timeline: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="8" cy="19" r="2" /><path d="M7 6h5a3 3 0 0 1 3 3v0a3 3 0 0 0 3 3M17.5 14c-1.1 3-3.5 5-7.5 5" /></>,
    document: <><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
    chart: <><path d="M4 20V9M10 20V4M16 20v-7M22 20H2" /></>,
    shield: <><path d="M12 3 4.5 6v5.5c0 4.7 3 7.8 7.5 9.5 4.5-1.7 7.5-4.8 7.5-9.5V6z" /><path d="m9 12 2 2 4-4" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

const DemoButton = ({ compact = false }: { compact?: boolean }) => (
  <a className={compact ? styles.navCta : styles.primaryCta} href="mailto:post@reachr.no?subject=Jeg ønsker en demo av plattformen">
    Bestill demo <Arrow />
  </a>
);

function ProductFrame() {
  const activities = [
    ["Samtale fullført", "Nordvest Elektro", "2 min"],
    ["Møte booket", "Havbris AS", "8 min"],
    ["Tilbud sendt", "Fjord Regnskap", "14 min"],
  ];

  return (
    <div className={styles.productFrame} aria-label="Forhåndsvisning av et tilpasset salgsdashboard">
      <div className={styles.browserBar}>
        <span className={styles.browserDots}><i /><i /><i /></span>
        <span>deres-plattform.no</span>
        <b><i /> Live</b>
      </div>
      <div className={styles.appPreview}>
        <aside className={styles.previewNav}>
          <div className={styles.previewLogo}>R</div>
          {["Oversikt", "Kunder", "Leads", "Salg", "Pipeline"].map((item, index) => (
            <div className={index === 0 ? styles.previewNavActive : ""} key={item}>
              <span>{index + 1}</span><b>{item}</b>
            </div>
          ))}
          <div className={styles.previewUser}><i>FN</i><span><b>Fredrik</b><small>Selger</small></span></div>
        </aside>
        <div className={styles.previewMain}>
          <header className={styles.previewHeader}>
            <div><small>Tirsdag 12. august</small><h3>God morgen, Fredrik.</h3></div>
            <button>+ Nytt salg</button>
          </header>
          <div className={styles.previewMetrics}>
            <article><small>Samtaler i dag</small><strong>47</strong><span>↑ 18% fra i går</span></article>
            <article><small>Møter booket</small><strong>6</strong><span>2 kommende</span></article>
            <article><small>Pipeline</small><strong>284 000</strong><span>12 aktive avtaler</span></article>
          </div>
          <div className={styles.previewGrid}>
            <article className={styles.activityChart}>
              <header><b>Aktivitet</b><span>Denne uken</span></header>
              <div>{[38, 56, 47, 75, 62, 91, 70].map((height, index) => <i className={index === 5 ? styles.activeBar : ""} style={{ height: `${height}%` }} key={index} />)}</div>
              <footer><span>M</span><span>T</span><span>O</span><span>T</span><span>F</span><span>L</span><span>S</span></footer>
            </article>
            <article className={styles.liveFeed}>
              <header><b>Siste aktivitet</b><span><i /> Live</span></header>
              {activities.map(([title, company, time], index) => (
                <div key={title}><i>{["FN", "EA", "TS"][index]}</i><p><b>{title}</b><small>{company}</small></p><time>{time}</time></div>
              ))}
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.navWrap}>
        <nav className={styles.nav} aria-label="Hovedmeny">
          <Link href="/" className={styles.logo} aria-label="Plattformens forside"><span>+</span>DIN PLATTFORM</Link>
          <div className={styles.navLinks}><a href="#produkt">Produkt</a><a href="#arbeidsflyt">Arbeidsflyt</a><a href="#sikkerhet">Sikkerhet</a></div>
          <div className={styles.navActions}><Link href="/login">Logg inn</Link><DemoButton compact /></div>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><i /> Vi bygger dashboardet for dere</p>
          <h1>Et dashboard laget<br /><span>rundt deres team.</span></h1>
          <p className={styles.heroLead}>Vi setter opp en salgsplattform som matcher måten dere jobber på. Etterpå kan dere selv endre sider, widgets, roller, farger, pipeline og arbeidsflyt når behovene endrer seg.</p>
          <div className={styles.heroActions}><DemoButton /><a href="#produkt">Se hvordan det virker <span>↓</span></a></div>
          <dl className={styles.heroFacts}><div><dt>Vi bygger</dt><dd>Dashboardet settes opp for deres team</dd></div><div><dt>Dere tilpasser</dt><dd>Endre struktur selv underveis</dd></div><div><dt>Alt kan justeres</dt><dd>Roller, sider, farger og flyt</dd></div></dl>
        </div>
        <ProductFrame />
      </section>

      <section className={styles.statement}>
        <p>Ingen team jobber helt likt.</p>
        <h2>Derfor bygger vi dashboardet rundt deres salgsprosess, og lar dere endre det videre når teamet vokser eller arbeidsflyten skifter.</h2>
      </section>

      <section id="produkt" className={styles.features}>
        <header className={styles.sectionHeader}><p>Bygget for dere, styrt av dere</p><h2>Start med et ferdig oppsett.<br />Tilpass når dere vil.</h2></header>
        <div className={styles.featureRows}>
          <article><div className={styles.featureMeta}><span>01</span><Icon name="search" /></div><div><h3>Vi setter opp første versjon</h3><p>Dere slipper å starte med et tomt system. Vi bygger dashboardet rundt målene, rollene og arbeidsflyten deres.</p></div><div className={styles.leadSample}><header><span>Widget</span><span>Visning</span></header><p><b>Mine ringbare leads</b><span>Selger</span><em>Øverst</em></p><p><b>Teamets pipeline</b><span>Leder</span><em>Synlig</em></p></div></article>
          <article><div className={styles.featureMeta}><span>02</span><Icon name="timeline" /></div><div><h3>Dere kan endre alt underveis</h3><p>Flytt widgets, skjul sider, endre farger, bytt rekkefølge og juster prosessen uten å måtte bygge dashboardet på nytt.</p></div><div className={styles.callSample}><span><i /><i /><i /><i /><i /><i /><i /></span><div><b>Din flyt</b><small>Tilpasset pipeline</small></div></div></article>
          <article><div className={styles.featureMeta}><span>03</span><Icon name="document" /></div><div><h3>La teamet få sine egne verktøy</h3><p>Velg hvilke faner, kontraktsmaler, moduler og snarveier hvert team og hver rolle skal se.</p></div><div className={styles.contractSample}><header><b>DERES MAL</b><span>Aktiv</span></header><i /><i /><i /><footer><span>Tilpasset for teamet</span><b>Ferdig</b></footer></div></article>
          <article><div className={styles.featureMeta}><span>04</span><Icon name="chart" /></div><div><h3>Bestem hva dere måler</h3><p>Bygg ledervisningen rundt tallene som betyr noe for dere, fra samtaler og møter til omsetning og fornyelser.</p></div><div className={styles.rankingSample}>{[["1", "Samtaler", "47"], ["2", "Møter", "6"], ["3", "Omsetning", "284k"]].map((item, index) => <p key={item[1]}><span>{index + 1}</span><i>{item[0]}</i><b>{item[1]}</b><strong>{item[2]}</strong></p>)}</div></article>
        </div>
      </section>

      <section id="arbeidsflyt" className={styles.workflow}>
        <div className={styles.workflowCopy}><p className={styles.eyebrow}><i /> Fra oppsett til løpende forbedring</p><h2>Vi bygger grunnmuren.<br />Dere styrer hverdagen.</h2><p>Dashboardet leveres klart for teamet, men er ikke låst. Når dere endrer salgsprosess, produkter eller roller, kan oppsettet endres med dere.</p></div>
        <div className={styles.workflowLine}>{[["01", "Kartlegg behov", "Vi finner ut hva teamet faktisk trenger."], ["02", "Bygg dashboard", "Vi setter opp sider, widgets og roller."], ["03", "Ta i bruk", "Teamet jobber i en ferdig tilpasset løsning."], ["04", "Juster underveis", "Dere kan endre oppsettet når behovene endrer seg."]].map(([n, title, copy]) => <article key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <section id="sikkerhet" className={styles.security}>
        <div className={styles.securityIcon}><Icon name="shield" /></div><div><p>Én plattform, deres oppsett</p><h2>Helt deres.<br />Alltid adskilt.</h2></div><p>Navn, farger, logo, roller, innhold, dashboard og data tilpasses deres organisasjon. Hver kunde får sitt eget isolerte arbeidsområde.</p><ul><li>Deres merkevare</li><li>Deres roller</li><li>Deres data</li></ul>
      </section>

      <section className={styles.finalCta}>
        <p>Se hvordan dashboardet kan bygges for dere</p><h2>Vi lager første versjon.<br />Dere kan endre den når dere vil.</h2><div><DemoButton /><Link href="/login">Allerede kunde? Logg inn</Link></div>
      </section>

      <footer className={styles.footer}><Link href="/" className={styles.logo}><span>+</span>DIN PLATTFORM</Link><p>Bygget rundt teamet deres.</p><nav><a href="#produkt">Produkt</a><a href="#arbeidsflyt">Tilpasning</a><Link href="/login">Logg inn</Link></nav><small>© {new Date().getFullYear()}</small></footer>
    </main>
  );
}
