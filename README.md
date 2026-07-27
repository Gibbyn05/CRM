# Salgssentral – internt sales-dashboard for callcenter

Et internt CRM/sales-dashboard for et norsk B2B-callcenter. Bygget med
**Next.js (App Router) + Supabase + Tailwind**, med **Claude API** for den
AI-genererte dagsavisen.

## Hvorfor denne stacken

Kravene passer Supabase svært godt: Postgres med Row Level Security dekker det
rollebaserte tilgangsbehovet (selger vs. salgssjef), **Supabase Realtime** gir
live-oppdatering av statustavla uten refresh, og innebygd Auth sparer oss for
egen brukerhåndtering. Next.js gir server-rendret UI, API-ruter for
telefoni-webhook / kontraktutsendelse / dagsavis, og enkel deploy (f.eks.
Vercel). Alt UI er på norsk og mobilvennlig; storskjerm-visningen er egen rute.

## Funksjoner

| # | Funksjon | Hvor |
|---|----------|------|
| 1 | **Live agent-status** (sanntid, storskjerm) | `/live`, `/tv` |
| 2 | **Kundekort + logg** (søk på navn/org.nr) | `/customers`, `/customers/[id]` |
| 3 | **Chat/kommentarer** (team + per kunde-case) | `/chat`, kundekortet |
| 4 | **Kontrakt-utsendelse** (e-post/SMS + status) | kundekortet, `/api/contracts/send` |
| 5 | **Kalender** (booking, avtaletyper) | `/calendar` |
| 6 | **Ledertavler** (dag/uke/måned/kvartal/år) | `/leaderboard` |
| 7 | **Salgsstatus / pipeline** (Kanban) | `/pipeline`, kundekortet |
| 8 | **AI-generert dagsavis** (Claude) | `/dagsavis`, `/api/dagsavis` |
| 9 | **Firmaoppslag på org.nr** (navn, daglig leder, telefon) | "Ny kunde", `/api/customers/brreg` |
| 10 | **Produkt-/priskatalog** | `/products` |
| 11 | **Kontrakt-/e-postmaler** med dynamiske felt | `/templates` |
| 12 | **Tilbudsflyt + digital signering** (sikker lenke, sporing, revisjonslogg) | kundekortet, `/sign/[token]` |

### 1. Live agent-status (kjernefunksjonen)
Viser alle selgere i sanntid med navn, status (**i samtale / ledig / ikke i
samtale / frakoblet**) og hvor lenge siden de sist ringte. `/live` bruker
Supabase Realtime for oppdatering uten refresh. `/tv` er en offentlig
kiosk-visning for storskjerm (poller `/api/live-board` hvert 5. sekund) — laget
for at "ingen skal kunne gjemme seg".

Status drives av telefoni-hendelser via et **abstrahert webhook-endepunkt**
(`/api/telephony/webhook`), slik at Bria/Ice-integrasjonen kan kobles på senere.

## Datamodell

Supabase-skjemaet ligger i `supabase/migrations/`:

- `0001_initial_schema.sql` — tabeller + enums:
  `profiles`, `agent_states`, `customers`, `call_logs`, `notes`, `deals`,
  `appointments`, `contracts`, `messages`, `daily_reports`.
- `0002_functions_triggers.sql` — `updated_at`, ny-bruker-trigger,
  `process_call_event()` (telefoni), `set_agent_status()`, `get_leaderboard()`.
- `0003_rls_policies.sql` — rollebasert Row Level Security.
- `0004_realtime.sql` — Realtime-publikasjon for live-tabellene.
- … `0005`–`0009` — avatarer, rolledashbord, direktemeldinger, delt
  kundetilgang, påminnelser/varsler/transkript.
- `0010_sales_process.sql` — salgsprosess/signering: `products`
  (priskatalog), `contract_templates` (kontrakt-/e-postmaler), `deal_items`
  (produktlinjer på et tilbud, med kontrollert prisoverstyring håndhevet i
  en trigger), utvidelse av `contracts` (signeringstoken, gjengitt
  dokument/e-post, IP, avslag/utløp) og `contract_events`
  (revisjonslogg for hele signeringsforløpet).

`call_logs.raw_payload` (jsonb) og `daily_reports.metrics` (jsonb) er bevisst
fleksible slik at detaljert samtaledata kan legges til senere uten
skjemaendringer.

## Kom i gang

### 1. Installer avhengigheter
```bash
npm install
```

### 2. Sett opp Supabase
Opprett et Supabase-prosjekt og kjør migrasjonene i rekkefølge (Supabase Studio
→ SQL Editor, eller `supabase db push` med Supabase CLI):

```
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_functions_triggers.sql
supabase/migrations/0003_rls_policies.sql
supabase/migrations/0004_realtime.sql
... (0005–0009)
supabase/migrations/0010_sales_process.sql
```

Eller lim inn hele `supabase/schema.sql` i ett kjør (samme innhold, samlet).

Opprett noen brukere (Authentication → Users). En profil + agent_states-rad
lages automatisk via trigger. Sett `role = 'manager'` på salgssjefen i
`profiles`-tabellen, og legg `extension` (softphone-id) på selgerne for
telefoni-kobling. Valgfritt: kjør `supabase/seed.sql` for eksempelkunder.

### 3. Miljøvariabler
Kopier `.env.example` til `.env.local` og fyll inn. Viktigst:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TELEPHONY_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`.

For tilbudsflyten/signering (se lenger ned): `NEXT_PUBLIC_APP_URL` (brukes i
signeringslenker), `SIGNING_LINK_TTL_DAYS` og `CONTRACTS_CRON_SECRET`.
`RESEND_API_KEY`/`SMS_PROVIDER_*` og `PROVIDER_1881_API_KEY`/
`PROVIDER_GULESIDER_API_KEY`/`PROVIDER_180_API_KEY` er valgfrie — uten dem
kjører e-post/SMS i dry-run og telefonoppslag hoppes bare over.

> **Deploy-merknad:** `NEXT_PUBLIC_*`-variablene bakes inn ved **build**. Sett
> dem i deploy-plattformen (f.eks. Vercel → Project Settings → Environment
> Variables) *før* du bygger, ellers vil klienten mangle Supabase-konfig i
> runtime. Selve `npm run build` krasjer ikke om de mangler, men appen fungerer
> ikke før de er satt og prosjektet er bygget på nytt.

### 4. Kjør
```bash
npm run dev
```
Åpne http://localhost:3000 (rot sender videre til `/live`).

## Telefoni-integrasjon (Bria / Ice)

Send normaliserte hendelser til webhook-endepunktet. Integrasjonen mot Bria
Desktop API/SDK via Ice oversetter Bria-hendelser til denne payloaden:

```bash
curl -X POST http://localhost:3000/api/telephony/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $TELEPHONY_WEBHOOK_SECRET" \
  -d '{
    "event_type": "call_started",
    "external_call_id": "call-abc-123",
    "extension": "1042",
    "phone_number": "+4790012345",
    "direction": "outbound"
  }'
```

Støttede `event_type`: `call_started`, `call_answered`, `call_ended`,
`call_missed`. Endepunktet er idempotent på `external_call_id` og oppdaterer
`call_logs` + `agent_states` atomisk, som igjen kringkastes til live-tavla.

## Rollebasert tilgang

- **Salgssjef (`manager`)**: ser hele live-tavla, ledertavler og alle
  kunder/deals/avtaler. Har tilgang til TV-visning.
- **Selger (`agent`)**: ser hele live-tavla (ingen gjemmer seg), men primært
  sine egne kunder, kalender og logg. Håndhevet via RLS i databasen.

## Firmaoppslag på org.nr

"Ny kunde" og tilbudsflyten kan slå opp et norsk organisasjonsnummer
automatisk via `/api/customers/brreg`, som bruker `src/lib/company-lookup/`:

- **Primærkilde: Brønnøysundregistrene** (Enhetsregisteret) — offisielt,
  gratis, ingen nøkkel, ingen scraping. Gir selskapsnavn, adresse og
  **daglig leder** (via rolleoversikten, `/enheter/{orgnr}/roller`).
- **Telefonnummer** har ingen fri offisiell API. Grensesnittet
  (`CompanyLookupProvider` i `types.ts`) er derfor bygget utskiftbart, med
  stub-implementasjoner for **1881**, **Gule Sider** og **180.no**
  (`phone-providers.ts`) som står av til noen limer inn en ekte
  API-nøkkel/URL for avtalen sin (`PROVIDER_*_API_KEY`/`PROVIDER_*_API_URL`).
  Uten nøkkel hoppes oppslaget bare over — feltet vises som "ikke
  tilgjengelig", aldri scrapet.
- Hvert felt i svaret er tagget med hvilken kilde det kom fra
  (`sources.name`, `sources.ceo_name`, `sources.phone`, …), og manglende data
  gir en menneskelesbar `notes`-liste — begge vises i UI-et.
- Org.nr valideres alltid med MOD11-kontrollsiffer (`isValidOrgNumber` i
  `src/lib/format.ts`) før oppslag.

## Produkter, maler og tilbudsflyt

- **Produktkatalog** (`/products`): navn, beskrivelse, standardpris,
  betalingsintervall (måned/år/engang), bindingstid og aktiv/inaktiv-status.
  Kun salgssjef kan redigere katalogen (håndhevet i RLS).
- **Kontrakt-/e-postmaler** (`/templates`): fritekst med `{{plassholdere}}`
  (kundenavn, org.nr, rådgiver, dato, produkt-/pristabell, totalpris, …), se
  `src/lib/templates.ts` for hele listen og gjengivelseslogikken. Live
  forhåndsvisning med eksempeldata vises mens du redigerer.
- **Tilbud** (kundekortet → "Salg/tilbud"): produkter fra katalogen legges på
  et tilbud (`deal_items`) med mengde og valgfri overstyrt pris. Et avvik på
  **mer enn 30 % under standardpris håndheves i databasen** — kun salgssjef
  kan godkjenne et slikt avvik (trigger `enforce_deal_item_price()`), ikke
  bare i UI-et.

## Digital signering

Kundekortet ("Tilbud/kontrakt") lar selgeren velge et tilbud + en
kontrakt-/e-postmal, **generere en forhåndsvisning** (dynamiske felt fylt
ut), **redigere den manuelt**, og sende via e-post/SMS:

1. `/api/contracts/send` lagrer nøyaktig det som ble forhåndsvist/redigert
   (`document_body`/`subject`/`email_body`), genererer en kryptografisk
   tilfeldig **signeringstoken** (`src/lib/tokens.ts`, 256 bit) med
   utløpsdato (`SIGNING_LINK_TTL_DAYS`, standard 14 dager), og sender lenken
   `NEXT_PUBLIC_APP_URL/sign/{token}`. Uten leverandørnøkler kjøres en
   **dry-run** som logger og markerer som sendt.
2. `/sign/[token]` er en offentlig side (ingen innlogging — selve token'et er
   autentiseringen) hvor kunden ser dokumentet og kan **godkjenne/signere**
   eller **avslå**. `/api/sign/[token]` er idempotent: gjentatte besøk/klikk
   endrer ikke tilstanden på nytt eller sender duplikate hendelser/e-poster.
3. Alle hendelser (**sendt/åpnet/signert/avslått/utløpt/sendt på nytt**) med
   tidspunkt, IP og (der relevant) e-post logges i `contract_events` og vises
   som en full revisjonslogg på kundekortet.
4. Ved signering sendes en **signert kopi på e-post til begge parter**
   (kunde + selger).
5. Utløpte lenker markeres lat ved besøk, og kan i tillegg feies proaktivt
   (for varsling selv om kunden aldri åpner lenken igjen) av
   `POST /api/contracts/expire` — sett opp en ekstern scheduler (Vercel Cron
   eller Supabase `pg_cron`) til å kalle den periodisk med
   `X-Cron-Secret: $CONTRACTS_CRON_SECRET`.

Koble på en ekte e-signaturløsning (BankID/Signicat o.l.) senere ved å bytte
ut `/sign/[token]`-flyten med leverandørens embed/redirect og la deres
webhook oppdatere `contracts.status` + `contract_events` på samme måte som i
dag — se "Videre arbeid".

### GDPR-notat

IP-adresse og signeringstidspunkt lagres i `contract_events`/`contracts` som
bevis for avtaleinngåelse (berettiget interesse/kontraktsoppfyllelse) — ikke
mer enn det som trengs for å dokumentere hendelsesforløpet. Revisjonsloggen
er kun synlig for selgere med tilgang til kunden (RLS). Prosjektet
implementerer ingen automatisk sletting/anonymisering av gamle
kontrakter/hendelser ennå — vurder en oppbevaringspolicy (f.eks. slett/
anonymiser N år etter avsluttet kundeforhold) før dette går i skarp drift.

## Dagsavis (Claude)

`/api/dagsavis` beregner gårsdagens nøkkeltall (telefoner, møter, salg, avslag)
og genererer en kort, lesbar oppsummering med Claude — inkludert et forsøk på å
peke ut hvor i salgsprosessen selgeren mister flest kunder, basert på
loggnotater og avslagsårsaker. Rapporten caches per (selger, dato). Modell
styres av `ANTHROPIC_MODEL` (standard `claude-opus-4-8`).

For automatisk generering hver morgen kan man legge til en Supabase-cron eller
en ekstern scheduler som POSTer til `/api/dagsavis` per aktiv selger.

## Prosjektstruktur

```
supabase/migrations/   SQL-skjema, funksjoner, RLS, realtime
src/
  app/
    (dashboard)/        innloggede sider (customers, pipeline, products, templates, ...)
    sign/[token]/        offentlig signeringsside
    tv/                 offentlig storskjerm-visning
    login/
    api/
      telephony/webhook telefoni-event-sink
      contracts/send    tilbudsutsendelse (mal -> signeringslenke)
      contracts/[id]/resend, contracts/expire
      sign/[token]      offentlig signerings-API (åpne/signer/avslå)
      customers/brreg   firmaoppslag på org.nr
      dagsavis           AI-dagsavis
      live-board         data til TV-visning
  components/           React-komponenter (kundekort, ProductsManager,
                         TemplatesManager, ContractsPanel, SignDocument, ...)
  lib/
    supabase/           client/server/admin/middleware
    company-lookup/     org.nr-oppslag (Brreg + pluggbare telefon-kilder)
    templates.ts        gjengivelse av kontrakt-/e-postmaler
    tokens.ts, request.ts, sms.ts, email.ts
    types.ts, constants.ts, format.ts, periods.ts
    anthropic.ts, dagsavis.ts
```

## Videre arbeid

- Faktisk Bria/Ice-integrasjon som mater webhooken.
- Ekte e-signaturløsning (BankID/Signicat) i stedet for
  bærer-token-signering — se "Digital signering" over for hvor webhooken skal
  kobles på.
- Ekte avtale/API-nøkkel for én eller flere av 1881/Gule Sider/180.no
  (telefonoppslag) — grensesnittet står klart i
  `src/lib/company-lookup/phone-providers.ts`.
- Ekte SMS-leverandør (Sveve/Link Mobility) i `src/lib/sms.ts`.
- Oppbevaringspolicy (sletting/anonymisering) for `contract_events`/
  `contracts` — se GDPR-notatet over.
- Detaljert samtale-analyse (bruk `call_logs.raw_payload`) for mer presis
  "hvor mistet vi kunden"-innsikt i dagsavisen.
- Push/varsling når dagsavisen er klar om morgenen.
