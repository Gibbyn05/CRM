import type { Metadata } from "next";
import Link from "next/link";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Reachr | Salgsplattformen som samler hele teamet",
  description: "Finn leads, ring, følg opp, send avtaler og mål resultatene i én norsk salgsplattform.",
};

const Arrow = () => <span aria-hidden="true">↗</span>;

const SignalIcon = ({ type }: { type: "search" | "call" | "contract" | "chart" | "team" | "flow" }) => {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></>,
    call: <path d="M7.4 3.8 10 7.6 8.2 9.4c1.4 2.8 3.6 5 6.4 6.4l1.8-1.8 3.8 2.6-.8 3c-.3 1-1.3 1.6-2.3 1.4C9.5 19.8 4.2 14.5 3 6.9c-.2-1 .4-2 1.4-2.3l3-.8Z"/>,
    contract: <><path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h6M14 3v4h4"/></>,
    chart: <><path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/></>,
    team: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.4-4 2.4-6 6-6s5.6 2 6 6M15 15c3.4 0 5.3 1.7 5.7 5"/></>,
    flow: <><rect x="3" y="4" width="6" height="5" rx="1"/><rect x="15" y="15" width="6" height="5" rx="1"/><path d="M9 6.5h4a4 4 0 0 1 4 4V15M15 17.5h-4a4 4 0 0 1-4-4V9"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>;
};

export default function Home() {
  return (
    <main
      className={styles.page}
      style={{ fontFamily: '"Avenir Next", "Segoe UI Variable", "Helvetica Neue", sans-serif' }}
    >
      <div className={styles.grid} aria-hidden="true" />
      <header className={styles.navWrap}>
        <nav className={styles.nav} aria-label="Hovedmeny">
          <Link href="/" className={styles.logo} aria-label="Reachr forside">
            <span className={styles.logoMark}>R</span><span>REACHR</span>
          </Link>
          <div className={styles.navLinks}>
            <a href="#plattform">Plattform</a><a href="#arbeidsflyt">Slik fungerer det</a><a href="#resultater">Resultater</a>
          </div>
          <div className={styles.navActions}>
            <Link href="/login" className={styles.login}>Logg inn</Link>
            <a href="#kontakt" className={styles.navCta}>Bestill demo <Arrow /></a>
          </div>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><span /> Bygget for norske salgsteam</div>
          <h1>Fra første ring<br />til <em>signert avtale.</em></h1>
          <p>Reachr samler prospektering, telefoni, kunder, pipeline, kontrakter og ledelse i én arbeidsflate. Mindre administrasjon. Mer salg.</p>
          <div className={styles.heroActions}>
            <a href="#kontakt" className={styles.primaryCta}>Se Reachr i praksis <Arrow /></a>
            <a href="#plattform" className={styles.textCta}>Utforsk plattformen <span>↓</span></a>
          </div>
          <div className={styles.proofLine}>
            <div className={styles.avatars}><span>FN</span><span>EA</span><span>TS</span><span>+</span></div>
            <p><strong>Én sannhet for hele teamet</strong><br />Live aktivitet på tvers av salgsgulvet</p>
          </div>
        </div>

        <div className={styles.productStage} aria-label="Forhåndsvisning av Reachr dashboard">
          <div className={styles.orbitOne} /><div className={styles.orbitTwo} />
          <div className={styles.productWindow}>
            <div className={styles.windowTop}><div className={styles.windowDots}><i/><i/><i/></div><span>reachr.no / dashboard</span><b>Live</b></div>
            <div className={styles.appShell}>
              <aside className={styles.miniSidebar}>
                <div className={styles.miniLogo}>R</div>
                {["Oversikt","Kunder","Reachr","Salg","Pipeline"].map((item, index) => <div key={item} className={index === 0 ? styles.activeMiniNav : ""}><span>{index + 1}</span>{item}</div>)}
                <div className={styles.miniUser}><i>FN</i><span>Fredrik<small>Selger</small></span></div>
              </aside>
              <div className={styles.miniMain}>
                <div className={styles.miniHeading}><div><small>God morgen, Fredrik</small><h3>Hold trykket oppe.</h3></div><button>+ Nytt salg</button></div>
                <div className={styles.metricRow}>
                  <div><small>Samtaler i dag</small><strong>47</strong><span>+18%</span></div>
                  <div><small>Møter booket</small><strong>6</strong><span>+2 i dag</span></div>
                  <div><small>Pipeline</small><strong>284k</strong><span>12 avtaler</span></div>
                </div>
                <div className={styles.dashboardBody}>
                  <div className={styles.chartCard}><div className={styles.cardLabel}><span>Aktivitet</span><small>Denne uken</small></div><div className={styles.chart}><i style={{height:"35%"}}/><i style={{height:"56%"}}/><i style={{height:"44%"}}/><i style={{height:"78%"}}/><i style={{height:"63%"}}/><i className={styles.blueBar} style={{height:"92%"}}/><i style={{height:"72%"}}/></div><div className={styles.chartDays}><span>M</span><span>T</span><span>O</span><span>T</span><span>F</span><span>L</span><span>S</span></div></div>
                  <div className={styles.feedCard}><div className={styles.cardLabel}><span>Live aktivitet</span><b>● Live</b></div>{[["FN","Samtale fullført","Media Norge AS"],["EA","Møte booket","Nordvest Elektro"],["TS","Avtale signert","Fjord Regnskap"]].map(([initials,title,company], i) => <div className={styles.feedItem} key={title}><i>{initials}</i><p><strong>{title}</strong><small>{company}</small></p><time>{i + 2}m</time></div>)}</div>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.floatingSignal}><span>↗</span><div><small>Konvertering denne uken</small><strong>24,8%</strong></div><b>+4,2%</b></div>
        </div>
      </section>

      <section className={styles.signalStrip} aria-label="Reachr fordeler">
        {[["01","Finn riktige bedrifter"],["02","Ring uten friksjon"],["03","Følg opp automatisk"],["04","Signer digitalt"]].map(([n,text]) => <div key={n}><span>{n}</span><strong>{text}</strong></div>)}
      </section>

      <section id="plattform" className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.kicker}>Hele salgsoperasjonen</p>
          <h2>Alt teamet trenger.<br /><span>Ingenting som står i veien.</span></h2>
          <p>Fra nye prospekter til innbetalt avtale. Reachr holder mennesker, aktiviteter og inntekter koblet sammen.</p>
        </div>
        <div className={styles.bento}>
          <article className={`${styles.bentoCard} ${styles.leadCard}`}><div className={styles.iconBox}><SignalIcon type="search" /></div><span className={styles.cardNumber}>01</span><h3>Prospekter som faktisk kan ringes</h3><p>Søk i norske bedrifter, finn kontaktinformasjon og reserver leads før en kollega rekker å ta det samme.</p><div className={styles.leadRows}>{[["Havbris AS","Daglig leder","Ringbar"],["Nordic Drift","Styreleder","Verifisert"],["Tinde Bygg","Sentralbord","Ny"]].map((r,i)=><div key={r[0]}><i>{r[0].slice(0,1)}</i><p><strong>{r[0]}</strong><small>{r[1]}</small></p><b>{r[2]}</b><span style={{width:`${82-i*14}%`}}/></div>)}</div></article>
          <article className={`${styles.bentoCard} ${styles.callCard}`}><div className={styles.iconBox}><SignalIcon type="call" /></div><span className={styles.cardNumber}>02</span><h3>Telefoni og CRM i samme rytme</h3><p>Status, samtaler og transkripsjon oppdateres mens teamet jobber.</p><div className={styles.callPulse}><span><i/><i/><i/><i/><i/><i/><i/><i/></span><b>12:48</b><small>Live samtale</small></div></article>
          <article className={`${styles.bentoCard} ${styles.contractCard}`}><div className={styles.iconBox}><SignalIcon type="contract" /></div><span className={styles.cardNumber}>03</span><h3>Kontrakter uten dobbeltarbeid</h3><p>CRM-data fylles inn i riktig mal. Selgeren kontrollerer, sender og følger signeringen.</p><div className={styles.contractPaper}><div><span>AVTALE</span><b>KLAR FOR SIGNERING</b></div><i/><i/><i/><footer><span>Eksempel AS</span><strong>25 000 kr</strong></footer></div></article>
          <article className={`${styles.bentoCard} ${styles.insightCard}`}><div className={styles.iconBox}><SignalIcon type="chart" /></div><span className={styles.cardNumber}>04</span><h3>Ledelse med puls</h3><p>Se aktivitet, konvertering, møter, tilbud og omsetning per selger og periode.</p><div className={styles.ranking}><div><b>1</b><i>FN</i><span>Fredrik</span><strong>128 400</strong></div><div><b>2</b><i>EA</i><span>Emil</span><strong>96 200</strong></div><div><b>3</b><i>TS</i><span>Test</span><strong>71 850</strong></div></div></article>
        </div>
      </section>

      <section id="arbeidsflyt" className={styles.workflowSection}>
        <div className={styles.workflowHeader}><p className={styles.kicker}>Én sammenhengende arbeidsflyt</p><h2>Reachr følger salget.<br />Fra start til mål.</h2></div>
        <div className={styles.workflowGrid}>
          <div className={styles.workflowSteps}>{[["01","Finn","Filtrer bedrifter og finn den rette beslutningstakeren."],["02","Kontakt","Ring, loggfør og se hele kundehistorikken live."],["03","Følg opp","Planlegg neste steg, møte eller oppgave uten å miste momentum."],["04","Lukk","Generer avtalen, få signaturen og følg betalingen."]].map(([n,t,d],i)=><div key={n} className={i===0?styles.activeStep:""}><span>{n}</span><div><h3>{t}</h3><p>{d}</p></div><b>→</b></div>)}</div>
          <div className={styles.workflowVisual}><div className={styles.flowHeader}><span>Pipeline / August</span><b>LIVE</b></div><div className={styles.flowColumns}>{[["Ny lead","12",["Havbris AS","Verdi Digital"]],["I dialog","8",["Nordvest Elektro","Tinde Bygg"]],["Tilbud sendt","5",["Fjord Regnskap","Moen Tech"]],["Signert","3",["Eksempel AS","Aksel Drift"]]].map(([title,count,cards],column)=><div key={title as string}><header><span>{title as string}</span><b>{count as string}</b></header>{(cards as string[]).map((card,index)=><article key={card}><small>{column===3?"SIGNERT":"OPPFØLGING"}</small><strong>{card}</strong><p>{column===3?"48 000 kr":`${index+1} dag siden`}</p><i style={{width:`${55+column*13}%`}}/></article>)}</div>)}</div></div>
        </div>
      </section>

      <section id="resultater" className={styles.resultsSection}>
        <div><p className={styles.kicker}>Bygget for adferd som skaper salg</p><h2>Mer tid i dialog.<br />Mindre tid i systemer.</h2></div>
        <div className={styles.resultStats}><article><strong>1</strong><span>arbeidsflate</span><p>Hele teamet jobber fra samme kunde- og aktivitetsbilde.</p></article><article><strong>Live</strong><span>oppdateringer</span><p>Ingen refresh. Ingen doble leads. Ingen skjult aktivitet.</p></article><article><strong>360°</strong><span>salgsoversikt</span><p>Fra første kontakt til signering, betaling og fornyelse.</p></article></div>
      </section>

      <section className={styles.securitySection}>
        <div className={styles.securityMark}><SignalIcon type="team" /></div><div><p className={styles.kicker}>Trygt mellom team</p><h2>Deres data er deres.</h2><p>Hver organisasjon har sitt eget avgrensede arbeidsområde. Brukere, kunder, filer, avtaler og sanntidsaktivitet holdes adskilt i databasen.</p></div><ul><li><span>✓</span>Organisasjonsbasert tilgang</li><li><span>✓</span>Rollebaserte rettigheter</li><li><span>✓</span>Private dokumenter og avtaler</li><li><span>✓</span>Sikker, norsk salgsflyt</li></ul>
      </section>

      <section id="kontakt" className={styles.finalCta}>
        <div className={styles.ctaGlow}/><p className={styles.kicker}>Klar for neste samtale?</p><h2>Gjør salgsdagen<br /><em>lettere å vinne.</em></h2><p>Se hvordan Reachr kan tilpasses teamet, prosessen og produktene deres.</p><div><a href="mailto:post@reachr.no?subject=Jeg ønsker en demo av Reachr" className={styles.primaryCta}>Bestill en demo <Arrow /></a><Link href="/login" className={styles.secondaryCta}>Allerede kunde? Logg inn</Link></div>
      </section>

      <footer className={styles.footer}><Link href="/" className={styles.logo}><span className={styles.logoMark}>R</span><span>REACHR</span></Link><p>Salgsplattformen for team som vil fremover.</p><div><a href="#plattform">Plattform</a><a href="#arbeidsflyt">Arbeidsflyt</a><Link href="/login">Logg inn</Link></div><small>© {new Date().getFullYear()} Reachr</small></footer>
    </main>
  );
}
