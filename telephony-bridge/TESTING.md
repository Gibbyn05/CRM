# Test-guide: telefoni-broen (uten ekte Bria)

Steg-for-steg for å teste hele telefoni-flyten på din egen Mac med «mock-Bria».
Kjør kommandoene **én linje om gangen**.

---

## Del A – CRM-siden i Vercel (gjøres én gang)

1. Finn på en hemmelighet (bare en tekst), f.eks. `bria-hemmelig-9f3k`.
2. Gå til **Vercel → prosjektet `crm` → Settings → Environment Variables**.
3. Legg til:
   - `TELEPHONY_WEBHOOK_SECRET` = hemmeligheten din
   - `OPENAI_API_KEY` = din OpenAI-nøkkel *(valgfritt – kun for transkript)*
4. Trykk **Save**, og deretter **Redeploy** (Deployments → nyeste → «Redeploy»).
   Uten redeploy virker ikke variablene.

## Del B – Finn en test-selgers ID (AGENT_ID)

1. Gå til **Supabase → prosjektet → Table Editor → `profiles`**.
2. Finn raden `selger@test.no`.
3. Kopier verdien i **`id`**-kolonnen (en lang «uuid»). Det er din `AGENT_ID`.

## Del C – Hent siste kode

```bash
cd ~/Downloads/CRM
```
```bash
git checkout claude/sales-dashboard-callcenter-22x5kt
```
```bash
git pull
```

## Del D – Sett opp broen

```bash
cd telephony-bridge
```
```bash
npm install
```
```bash
cp .env.example .env
```
```bash
open -e .env
```
Fyll inn og lagre:
```
CRM_BASE_URL=https://crm-mu-eight-76.vercel.app
WEBHOOK_SECRET=bria-hemmelig-9f3k          # NØYAKTIG samme som i Vercel
AGENT_ID=<uuid-en du kopierte fra Supabase>
BRIA_WS_URL=ws://127.0.0.1:9099/counterpath/socketapi/v1/
RECORDINGS_DIR=/tmp
LOG_LEVEL=info
```

## Del E – Kjør testen (to terminalvinduer)

**Vindu 1 – start mock-Bria:**
```bash
cd ~/Downloads/CRM/telephony-bridge
```
```bash
npm run mock-bria
```
Du skal se: `Mock-Bria kjører på ws://127.0.0.1:9099/...`

**Vindu 2 – åpne nytt terminalvindu (Cmd+N), start broen:**
```bash
cd ~/Downloads/CRM/telephony-bridge
```
```bash
npm start
```

## Del F – Hva du skal se

- **Vindu 2 (broen):** `Tilkoblet Bria` → `started` → `answered` → `ended` → `Opplasting OK`
- **Vindu 1 (mock):** `Ringing → Connected → Avsluttet`
- **I CRM-en** (logg inn som `manager@test.no`): **Dashbord → «Sist ringt»** viser
  samtalen med nummer `+4790012345`.

Vil du teste på nytt: trykk `Ctrl+C` i vindu 2 og kjør `npm start` igjen (mocken
i vindu 1 kan bli stående).

## Del G – (valgfritt) test opptak → transkript

Mens mock-samtalen pågår (innen ~7 sekunder etter start), lag en lydfil i mappa
broen overvåker. I et tredje vindu:
```bash
printf x > /tmp/test-$(date +%s).mp3
```
Broen plukker den opp når samtalen «avsluttes» og laster den opp. Har du satt
`OPENAI_API_KEY` i Vercel, dukker et sammendrag opp på kundekortet.

## Del H – Stopp

Trykk `Ctrl+C` i begge vinduene.

---

## Feilsøking

| Symptom | Årsak / fiks |
|---------|--------------|
| `Mangler konfigurasjon …` | Et felt i `.env` er tomt. |
| Broen: `Kobler til Bria … prøver igjen` i loop | Mock-Bria (vindu 1) kjører ikke, eller feil `BRIA_WS_URL`. |
| Broen: `HTTP 401` | `WEBHOOK_SECRET` matcher ikke `TELEPHONY_WEBHOOK_SECRET` i Vercel. |
| Broen sier `Opplasting OK`, men ingenting i CRM | Du glemte å **redeploye** i Vercel etter å ha lagt inn secret. |
| Broen: `HTTP 429` | Rate limit – vent et minutt. |
| `npm: command not found` | Node.js er ikke installert – installer fra nodejs.org (LTS). |
