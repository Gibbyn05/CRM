# Salgssentral – internt sales-dashboard for callcenter

Et internt CRM/sales-dashboard for et norsk B2B-callcenter. Bygget med
**Next.js (App Router) + Supabase + Tailwind**, med **OpenAI API** for den
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
| 8 | **AI-generert dagsavis** (OpenAI) | `/dagsavis`, `/api/dagsavis` |

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
```

Opprett noen brukere (Authentication → Users). En profil + agent_states-rad
lages automatisk via trigger. Sett `role = 'manager'` på salgssjefen i
`profiles`-tabellen, og legg `extension` (softphone-id) på selgerne for
telefoni-kobling. Valgfritt: kjør `supabase/seed.sql` for eksempelkunder.

### 3. Miljøvariabler
Kopier `.env.example` til `.env.local` og fyll inn. Viktigst:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TELEPHONY_WEBHOOK_SECRET`, `OPENAI_API_KEY`.

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

## Kontrakt-utsendelse

`/api/contracts/send` oppretter en kontrakt-rad og sender via e-post/SMS. Uten
leverandørnøkler kjøres en **dry-run** som logger og markerer som sendt. Koble
på Resend/Postmark (e-post) og Twilio/Sveve (SMS) i `sendEmail`/`sendSms`.
Status-sporing (åpnet/signert) er forberedt i datamodellen og oppdateres senere
via en leverandør-webhook.

## Dagsavis (OpenAI)

`/api/dagsavis` beregner dagsavis-data for selger eller team, inkludert
samtaler, salg, omsetning, nye kunder og bookede møter, og genererer en kort,
lesbar oppsummering med OpenAI. Dagsavisen åpnes som en modal fra sidebar-knappen
og har også en ledervisning med selgeroversikt og tidsserie-graf.

Automatisk generering og utsending styres av cron-endepunktet på samme route.
Vercel treffer jobben kl. 18:00 og 19:00 UTC, mens route-koden sjekker at lokal
tid faktisk er 20:00 i `Europe/Oslo`. Dette håndterer sommer- og vintertid uten
å sende to ganger. Jobben genererer dagens team- og selgerrapporter, sender
e-post til aktive selgere og sender teamavis til aktive ledere. SMS er stubbet
bak `DAGSAVIS_SMS_ENABLED=false` til SMS-leverandør/abonnement er klart. Sett
`CRON_SECRET`, `RESEND_API_KEY` og `EMAIL_FROM` i miljøet.

## Prosjektstruktur

```
supabase/migrations/   SQL-skjema, funksjoner, RLS, realtime
src/
  app/
    (dashboard)/        innloggede sider (live, customers, pipeline, ...)
    tv/                 offentlig storskjerm-visning
    login/
    api/
      telephony/webhook telefoni-event-sink
      contracts/send    kontraktutsendelse
      dagsavis           AI-dagsavis
      live-board         data til TV-visning
  components/           React-komponenter (LiveBoard, kundekort, chat, ...)
  lib/
    supabase/           client/server/admin/middleware
    types.ts, constants.ts, format.ts, periods.ts
    openai.ts, anthropic.ts, dagsavis.ts
```

## Videre arbeid

- Faktisk Bria/Ice-integrasjon som mater webhooken.
- E-signaturløsning + status-webhook for kontrakter.
- Detaljert samtale-analyse (bruk `call_logs.raw_payload`) for mer presis
  "hvor mistet vi kunden"-innsikt i dagsavisen.
- Push/varsling når dagsavisen er klar om morgenen.
