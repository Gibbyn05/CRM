type Update = {
  title: string;
  description: string;
  area: string;
};

type UpdateDay = {
  date: string;
  label: string;
  updates: Update[];
};

const UPDATE_DAYS: UpdateDay[] = [
  {
    date: "11. august",
    label: "I dag",
    updates: [
      { title: "Live kundekort", description: "Filer, kontaktinformasjon, status og egendefinerte felt oppdateres nå mellom kollegaer uten refresh.", area: "Kunder" },
      { title: "Trygg reservasjon av leads", description: "Reachr hindrer at to selgere legger til samme bedrift samtidig. Første reservasjon vinner.", area: "Reachr" },
      { title: "Smarte kontrakt-placeholders", description: "Kontraktsmaler kan bruke CRM-felter som kundenavn, organisasjonsnummer, pris, produkt og avtaledato.", area: "Kontrakter" },
      { title: "Kommunikasjonssiden er fjernet", description: "Det utgåtte menypunktet og den separate innstillingssiden er ryddet bort.", area: "Navigasjon" },
    ],
  },
  {
    date: "10. august",
    label: "Stor produktoppdatering",
    updates: [
      { title: "Personlige dashboard-widgets", description: "Alle brukere kan velge synlige widgets, rekkefølge, prioritet og farge. Oppsettet lagres per bruker.", area: "Dashboard" },
      { title: "Personlig sidemeny", description: "Alle brukere kan velge kategorier og sider i menyen, skjule dem og endre rekkefølgen.", area: "Navigasjon" },
      { title: "Mer relevante samtaletider", description: "Samtaleoversikten viser aktive ringetimer og skjuler de døde timene fra 20:00 til 07:00.", area: "Dashboard" },
      { title: "Oppgaver og kalender synkronisert", description: "Relevante oppgaver og kalenderhendelser henger nå sammen i dashboardet.", area: "Kalender" },
      { title: "Teamanalyse for ledere", description: "Ledere kan velge selger og periode og sammenligne samtaler, møter, tilbud, avtaler, omsetning og konvertering.", area: "Analyse" },
      { title: "Tydelig avtaleprogresjon", description: "Aktive avtaler følger løpet Tilbud sendt, Signert og Betalt, med egen markering for forfall og rollebasert tilgang.", area: "Salg" },
      { title: "Siste aktivitet på kunden", description: "Sist ringt er erstattet med en samlet aktivitetsvisning for samtaler, e-post, møter, notater, oppgaver, tilbud og betalinger.", area: "Kunder" },
      { title: "Ny visuell ledertavle", description: "Topp tre har større profilbilder og tydelig gull-, sølv- og bronserangering. Øvrige plasser vises uten medalje.", area: "Ledertavle" },
      { title: "Dagsavis i svart-hvitt", description: "Dagsavisen har fått responsiv avis-layout, daglig roterende salgsbilde og motiverende sitater for salgsteamet.", area: "Dagsavis" },
      { title: "Avansert kundesortering", description: "Kundelisten kan sorteres stigende og synkende etter dato, navn, aktivitet, status og selger.", area: "Kunder" },
      { title: "Tilpassbar kundereise", description: "Brukere kan opprette, gi nytt navn, flytte, sortere og slette egne steg i kundereisen.", area: "Kundereise" },
      { title: "Signeringsstempel", description: "Signerte kontrakter merkes med navn, telefon, e-post, dato og tidspunkt for signering.", area: "Kontrakter" },
      { title: "Kontraktkopier til teamet", description: "Etter signering sendes kopi til selgeren og lederprofilene i teamet.", area: "Kontrakter" },
      { title: "Betalingsstatus i Min inntekt", description: "Betalt, Ikke betalt og Over forfall er nå tydelig adskilt og fargekodet.", area: "Inntekt" },
      { title: "Større aktivitetslogg", description: "Kundekortet har fått et bredt kronologisk arbeidsområde med fast skrivefelt og kontaktinformasjon i samme høyde.", area: "Kunder" },
      { title: "Ny kontrakt-layout", description: "Forhåndsvisning og ferdig dokument følger den tidligere kontraktens struktur med kunde, leverandør, produkter, priser og vilkår.", area: "Kontrakter" },
      { title: "AI-baserte kontraktsmaler", description: "Organisasjonen kan administrere flere maler, knytte dem til produkter og generere kontrollerbare kontraktsutkast fra CRM-data.", area: "AI og kontrakter" },
    ],
  },
  {
    date: "9. august",
    label: "Reachr",
    updates: [
      { title: "Stabil søkeresultatliste", description: "Finn nummer flytter ikke lenger raden mens du arbeider, og Legg til er alltid tilgjengelig i tabellen.", area: "Reachr" },
      { title: "Søk uten obligatoriske filtre", description: "Reachr støtter nå brede bedriftssøk og har mer presis kobling mellom søkeord og bransjer.", area: "Reachr" },
      { title: "1881-signaler", description: "Systemet finner registrerte søkeord, viser Aktiv på 1881 og støtter både filtrering, massesjekk og egen 1881-søkefane.", area: "Reachr" },
      { title: "Verifiserte kontaktpersoner", description: "Kontaktfunn prioriterer daglig leder, styreleder og sentralbord, og kvalitetssikrer personer mot flere datapunkter.", area: "Reachr" },
    ],
  },
  {
    date: "8. august",
    label: "Søk og arbeidsflyt",
    updates: [
      { title: "Telefonoppslag på forespørsel", description: "Finn nummer bruker flere kilder og nettsider på forespørsel, uten å gjøre hele søkeresultatet tregt.", area: "Reachr" },
      { title: "1881-integrasjon", description: "Bedriftsnummer og kontaktdata kan berikes fra 1881 med lenker til eksterne kilder.", area: "Reachr" },
      { title: "Raskere store lister", description: "Reachr og kundelisten er paginert og optimalisert for større datamengder.", area: "Ytelse" },
      { title: "Kunder og potensielle kunder", description: "Kundesiden er delt i tydelige faner for eksisterende og potensielle kunder.", area: "Kunder" },
      { title: "Krever oppmerksomhet", description: "Dashboardet fremhever forfalte oppgaver, dagens frister, møter og manglende oppfølging med riktige farger.", area: "Dashboard" },
      { title: "Kjøps- og kvalitetssignaler", description: "Reachr viser relevante signaler og støtter valg og handlinger på flere leads samtidig.", area: "Reachr" },
      { title: "Telefonnummer i globalt søk", description: "Toppsøket kan finne kunder direkte på telefonnummer og organisasjonsnummer.", area: "Søk" },
      { title: "OpenAI for AI-funksjoner", description: "AI-funksjonene i Reachr er flyttet til OpenAI-integrasjonen.", area: "AI" },
      { title: "Fiken og provisjon", description: "Fiken-fakturaer knyttes til provisjoner og vises korrekt i Min inntekt.", area: "Regnskap" },
      { title: "SMS- og e-postoppsett", description: "Kalenderpåminnelser kan sendes på SMS, med ferdig leverandøroppsett for SMS og e-post.", area: "Påminnelser" },
    ],
  },
  {
    date: "7. august",
    label: "Kundekort og salg",
    updates: [
      { title: "Filer og egendefinert info", description: "Kundekortet har egne faner for dokumenter og fleksible informasjonsfelt, med tellere i fanene.", area: "Kunder" },
      { title: "Salg direkte fra kundekortet", description: "Salg-fanen åpner hele salgsveiviseren og lar selgeren opprette avtalen uten å forlate kunden.", area: "Salg" },
      { title: "AI-steg i salgsveiviseren", description: "Kontrakter kan genereres som del av salgsflyten, og faktura kan sendes fra avtalen.", area: "Kontrakter" },
      { title: "Innebygd e-signering", description: "Reachr har fått en selvhostet signeringsflyt med unik signeringslenke og lagret kontrakt.", area: "Kontrakter" },
      { title: "Redigerbar kontaktinformasjon", description: "Navn, e-post, telefon og adresse kan redigeres direkte på kundekortet.", area: "Kunder" },
    ],
  },
  {
    date: "6. august",
    label: "Aktivitetslogg",
    updates: [
      { title: "Aktivitetsloggen ble arbeidsflaten", description: "Loggen er betydelig større og viser kundehistorikken som en kronologisk, samtalelignende strøm.", area: "Kunder" },
      { title: "Lesbare aktivitetskort", description: "Samtaler, e-post og salg vises med tydelige kort, ikoner og detaljer på tvers av fanene.", area: "Kunder" },
    ],
  },
  {
    date: "5. august",
    label: "Integrasjoner og kapasitet",
    updates: [
      { title: "100 Reachr-resultater", description: "Hver søkeresultatside viser opptil 100 bedrifter i stedet for 50.", area: "Reachr" },
      { title: "Bedre Fiken-feilsøking", description: "Organisasjonen identifiseres automatisk fra tokenet, og reelle feil ved tilkobling og kontaktopprettelse vises til brukeren.", area: "Regnskap" },
    ],
  },
];

const totalUpdates = UPDATE_DAYS.reduce((sum, day) => sum + day.updates.length, 0);

export default function UpdatesPage() {
  return (
    <div className="mx-auto max-w-6xl pb-16">
      <header className="relative overflow-hidden rounded-[2rem] border border-[#d8c9b0] bg-[#171717] px-6 py-10 text-[#fffaf0] shadow-[0_28px_80px_rgba(43,33,24,0.16)] sm:px-10 sm:py-14">
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full border border-[#09fe94]/30" />
        <div className="absolute -right-4 -top-8 h-44 w-44 rounded-full border border-[#09fe94]/50" />
        <div className="relative max-w-3xl">
          <p className="mb-5 flex items-center gap-3 text-xs font-black uppercase tracking-[0.24em] text-[#09fe94]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#09fe94]" />
            Produktjournal · siste 7 dager
          </p>
          <h1 className="font-display text-5xl font-bold leading-[0.95] sm:text-7xl">Dette er nytt i Reachr</h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[#d8d0c4] sm:text-lg">
            En samlet oversikt over forbedringene som er levert fra 5. til 11. august. Nyeste endringer står øverst.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
            <span className="rounded-full bg-[#09fe94] px-4 py-2 text-[#171717]">{totalUpdates} forbedringer</span>
            <span className="rounded-full border border-white/20 px-4 py-2 text-white/80">7 dager</span>
          </div>
        </div>
      </header>

      <div className="mt-12 space-y-14">
        {UPDATE_DAYS.map((day, dayIndex) => (
          <section key={day.date} className="grid gap-6 md:grid-cols-[12rem_1fr]">
            <div className="md:sticky md:top-6 md:self-start">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8a7961]">{day.label}</p>
              <h2 className="mt-2 font-display text-3xl font-bold text-[#2b2118]">{day.date}</h2>
              <p className="mt-2 text-sm text-[#8a8177]">{day.updates.length} endringer</p>
            </div>

            <div className="overflow-hidden rounded-[1.75rem] border border-[#dfd2bd] bg-[#fffaf0]/75 shadow-[0_20px_55px_rgba(43,33,24,0.06)]">
              {day.updates.map((update, index) => (
                <article
                  key={update.title}
                  className="group grid gap-3 border-b border-[#e8dece] p-5 transition-colors last:border-b-0 hover:bg-[#f7ffe9] sm:grid-cols-[2.25rem_1fr_auto] sm:items-start sm:gap-4 sm:p-6"
                  style={{ animationDelay: `${(dayIndex * 50) + (index * 35)}ms` }}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cdbfa9] bg-white font-mono text-xs font-bold text-[#7a6b55] transition group-hover:border-[#09c97a] group-hover:bg-[#09fe94] group-hover:text-[#171717]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-[#2b2118] sm:text-lg">{update.title}</h3>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-[#70685f]">{update.description}</p>
                  </div>
                  <span className="w-fit rounded-full border border-[#dfd2bd] bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#85745e]">
                    {update.area}
                  </span>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
