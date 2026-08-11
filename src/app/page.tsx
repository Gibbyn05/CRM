import type { Metadata } from "next";
import Link from "next/link";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Reachr | Salgsarbeidet samlet på ett sted",
  description:
    "Finn nye kunder, ring, følg opp og lukk avtaler i én arbeidsflate laget for norske salgsteam.",
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
  <a className={compact ? styles.navCta : styles.primaryCta} href="mailto:post@reachr.no?subject=Jeg ønsker en demo av Reachr">
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
    <div className={styles.productFrame} aria-label="Forhåndsvisning av Reachr">
      <div className={styles.browserBar}>
        <span className={styles.browserDots}><i /><i /><i /></span>
        <span>app.reachr.no</span>
        <b><i /> Live</b>
      </div>
      <div className={styles.appPreview}>
        <aside className={styles.previewNav}>
          <div className={styles.previewLogo}>R</div>
          {["Oversikt", "Kunder", "Reachr", "Salg", "Pipeline"].map((item, index) => (
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
          <Link href="/" className={styles.logo} aria-label="Reachr forside"><span>R</span>REACHR</Link>
          <div className={styles.navLinks}><a href="#produkt">Produkt</a><a href="#arbeidsflyt">Arbeidsflyt</a><a href="#sikkerhet">Sikkerhet</a></div>
          <div className={styles.navActions}><Link href="/login">Logg inn</Link><DemoButton compact /></div>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><i /> Salgsplattform for norske team</p>
          <h1>Selg mer.<br /><span>Lettere.</span></h1>
          <p className={styles.heroLead}>Reachr samler leads, telefoni, oppfølging, avtaler og ledelse i én arbeidsflate. Teamet får arbeidsro. Lederen får oversikt.</p>
          <div className={styles.heroActions}><DemoButton /><a href="#produkt">Se hvordan det virker <span>↓</span></a></div>
          <dl className={styles.heroFacts}><div><dt>Én arbeidsflate</dt><dd>Fra lead til betaling</dd></div><div><dt>Sanntid</dt><dd>Ingen doble leads</dd></div><div><dt>Norsk salgsflyt</dt><dd>Bygget rundt teamet</dd></div></dl>
        </div>
        <ProductFrame />
      </section>

      <section className={styles.statement}>
        <p>Salgsverktøy skal fjerne arbeid, ikke skape mer av det.</p>
        <h2>Reachr holder hele kundereisen samlet, slik at selgeren kan bruke tiden på neste samtale.</h2>
      </section>

      <section id="produkt" className={styles.features}>
        <header className={styles.sectionHeader}><p>Plattformen</p><h2>Det teamet trenger.<br />Ikke mer.</h2></header>
        <div className={styles.featureRows}>
          <article><div className={styles.featureMeta}><span>01</span><Icon name="search" /></div><div><h3>Finn noen det er verdt å ringe</h3><p>Filtrer norske bedrifter, finn riktig kontakt og reserver leadet før noen andre i teamet gjør det.</p></div><div className={styles.leadSample}><header><span>Bedrift</span><span>Kontakt</span></header><p><b>Nordvest Elektro AS</b><span>Daglig leder</span><em>Verifisert</em></p><p><b>Havbris Regnskap</b><span>Sentralbord</span><em>Ringbar</em></p></div></article>
          <article><div className={styles.featureMeta}><span>02</span><Icon name="phone" /></div><div><h3>Ring uten å bytte kontekst</h3><p>Samtalen, notatet og neste aktivitet havner på kunden mens selgeren jobber.</p></div><div className={styles.callSample}><span><i /><i /><i /><i /><i /><i /><i /></span><div><b>12:48</b><small>Samtale pågår</small></div></div></article>
          <article><div className={styles.featureMeta}><span>03</span><Icon name="document" /></div><div><h3>Gå fra ja til signatur</h3><p>Bruk kundedata og organisasjonens mal til å lage, kontrollere og sende avtalen.</p></div><div className={styles.contractSample}><header><b>AVTALE</b><span>Klar for signering</span></header><i /><i /><i /><footer><span>Eksempel AS</span><b>25 000 kr</b></footer></div></article>
          <article><div className={styles.featureMeta}><span>04</span><Icon name="chart" /></div><div><h3>Se hva som faktisk beveger salget</h3><p>Sammenlign samtaler, møter, tilbud, signeringer og omsetning på tvers av perioden.</p></div><div className={styles.rankingSample}>{[["FN", "Fredrik", "128 400"], ["EA", "Emil", "96 200"], ["TS", "Test", "71 850"]].map((item, index) => <p key={item[1]}><span>{index + 1}</span><i>{item[0]}</i><b>{item[1]}</b><strong>{item[2]}</strong></p>)}</div></article>
        </div>
      </section>

      <section id="arbeidsflyt" className={styles.workflow}>
        <div className={styles.workflowCopy}><p className={styles.eyebrow}><i /> En sammenhengende prosess</p><h2>Fra første kontakt til fornyelse.</h2><p>Ingen eksport. Ingen kopiering. Ingen usikkerhet om hvor kunden befinner seg.</p></div>
        <div className={styles.workflowLine}>{[["01", "Finn", "Velg bedrifter og beslutningstakere."], ["02", "Kontakt", "Ring og loggfør i samme visning."], ["03", "Følg opp", "Avtal neste aktivitet før du går videre."], ["04", "Lukk", "Send, signer og følg betalingen."]].map(([n, title, copy]) => <article key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <section id="sikkerhet" className={styles.security}>
        <div className={styles.securityIcon}><Icon name="shield" /></div><div><p>Separate arbeidsområder</p><h2>Deres kunder. Deres data.</h2></div><p>Hver organisasjon har avgrensede brukere, kunder, filer, avtaler og sanntidsstrømmer. Roller avgjør hvem som kan se og endre hva.</p><ul><li>Organisasjonsbasert tilgang</li><li>Private dokumenter</li><li>Rollebaserte rettigheter</li></ul>
      </section>

      <section className={styles.finalCta}>
        <p>Se Reachr med deres salgsprosess</p><h2>Færre systemer.<br />Flere gode samtaler.</h2><div><DemoButton /><Link href="/login">Allerede kunde? Logg inn</Link></div>
      </section>

      <footer className={styles.footer}><Link href="/" className={styles.logo}><span>R</span>REACHR</Link><p>Salgsarbeidet samlet på ett sted.</p><nav><a href="#produkt">Produkt</a><a href="#arbeidsflyt">Arbeidsflyt</a><Link href="/login">Logg inn</Link></nav><small>© {new Date().getFullYear()} Reachr</small></footer>
    </main>
  );
}
