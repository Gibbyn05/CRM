# Salgssentral telefoni-bro

Lite bakgrunnsprogram som kjører på **hver selger-PC**. Det kobler **Bria
softphone** til **Salgssentral CRM**:

1. Lytter på Bria Desktop API (lokal WebSocket) og sender samtalehendelser
   (startet / svart / avsluttet) til CRM-en → **samtalelogg, «i samtale»-status
   og «Sist ringt»**.
2. Finner opptaksfila Bria lager for hver samtale, kobler den til rett samtale
   (via tidsvindu) og laster den opp → CRM-en **transkriberer og lager
   sammendrag** på kundekortet.

Retningen er alltid **PC → CRM** over HTTPS. Serveren når aldri inn på PC-en.
Maskinene snakker ikke med hverandre; hver bro er merket med sin egen selger
(`AGENT_ID`) og hver samtale har en unik ID, så filer kan ikke blande seg.

---

## Forutsetninger (per PC)

- **Bria Enterprise** installert og innlogget, med:
  - **Desktop API aktivert** (se Bria-innstillinger / Developer Guide).
  - **Samtaleopptak på**, med en fast opptaksmappe.
- **Node.js 18+** (kun hvis du kjører fra kilde – den ferdig pakkede `.exe`
  trenger ikke Node).

## Oppsett (fra kilde)

```bash
cd telephony-bridge
npm install
cp .env.example .env      # fyll inn verdiene
npm start
```

### Konfigurasjon (`.env`)

| Variabel | Hva |
|----------|-----|
| `CRM_BASE_URL` | CRM-ens produksjons-URL |
| `WEBHOOK_SECRET` | Lik `TELEPHONY_WEBHOOK_SECRET` i CRM-ens miljøvariabler |
| `AGENT_ID` | Selgerens CRM-bruker-ID (eller bruk `EXTENSION`) |
| `BRIA_WS_URL` | Bria sin lokale WebSocket (fra Developer Guide) |
| `RECORDINGS_DIR` | Bria sin opptaksmappe |
| `DELETE_AFTER_UPLOAD` | Slett lokal fil etter opplasting (true/false) |

## Distribusjon til 10 PC-er

Bygg én kjørbar fil (ingen Node kreves på PC-ene):

```bash
npm run build:exe        # lager dist/ med Windows- og Mac-binær
```

Legg binæren + en ferdig `.env` (med riktig `AGENT_ID` per selger) på hver
maskin, og få den til å **starte automatisk**:

- **Windows:** Oppgaveplanlegger → «Ved pålogging» → kjør binæren. (Eventuelt
  som Windows-tjeneste via `nssm`.)
- **Mac:** en `launchd`-agent i `~/Library/LaunchAgents`.

IT kan rulle dette ut sentralt på alle 10 maskinene samtidig.

## På CRM-siden

Sett disse miljøvariablene i Vercel:

- `TELEPHONY_WEBHOOK_SECRET` – samme hemmelighet som broen bruker.
- `OPENAI_API_KEY` – for transkribering (Whisper). Uten den lagres opptaket som
  «mottatt, ikke transkribert», og broen prøver ikke på nytt i det uendelige.

Endepunkter broen bruker (finnes allerede i appen):
- `POST /api/telephony/webhook` – samtalehendelser
- `POST /api/telephony/recording` – opptaksfil (multipart)

---

## Viktige forbehold (les før produksjon)

- **Bria-API-detaljer må bekreftes.** Nøyaktig `BRIA_WS_URL`/port og XML-formatet
  på hendelsene varierer mellom Bria-versjoner. Tolkningen ligger samlet i
  `src/bria.js` (`parseBriaMessage`) – juster tag-/attributtnavn mot
  [Bria Desktop API Developer Guide](https://www.counterpath.com/bria-desktop-api/)
  og eksemplene på [github.com/CounterPathAPI](https://github.com/CounterPathAPI).
  Kjør med `LOG_LEVEL=debug` for å se de rå meldingene fra Bria.
- **Opptak = samtykke.** Bria spiller en opptakstone/beskjed til motparten. Sørg
  for at dette er slått på, og at bruken er avklart mot GDPR/personvern.
- **Filstørrelse.** Vercel serverless har ~4,5 MB grense på request-body. Bruk
  komprimert lyd (mp3/opus) fra Bria for lange samtaler, eller utvid til
  opplasting via Supabase Storage i en senere versjon.
- **Kø ved krasj.** Opplastingskøen ligger i minnet; ved en hard krasj kan
  ikke-sendte jobber gå tapt. For full garanti kan køen persisteres til disk.
