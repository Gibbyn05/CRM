# Møte-guide: sette opp Bria + telefoni (digitalt møte)

Tre korte guider – én per rolle. Målet med møtet: skru på API + opptak i Bria
på **én test-PC**, kjøre broen, og ta **én ekte testsamtale** som dukker opp i
CRM-en.

---

## 👤 Guide A – Deg (Fredrik)

**Før møtet:**
- Vercel → prosjektet `crm` → Settings → Environment Variables:
  - `TELEPHONY_WEBHOOK_SECRET` = en hemmelighet du velger
  - `OPENAI_API_KEY` = din OpenAI-nøkkel (for transkript)
  - **Redeploy** etterpå (ellers gjelder de ikke).
- Ha broen klar (kildekode eller `.exe`) + en `.env`-mal.
- Finn `AGENT_ID` (bruker-ID) til test-selgeren (Supabase → profiles).

**I møtet (du styrer):**
1. Be IT skru på de to tingene i Bria (se Guide B).
2. Legg broen + `.env` på test-PC-en. `.env` skal ha:
   ```
   CRM_BASE_URL=https://crm-mu-eight-76.vercel.app
   WEBHOOK_SECRET=<samme som i Vercel>
   AGENT_ID=<test-selgerens uuid>
   BRIA_WS_URL=wss://cpclientapi.softphone.com:9002/counterpath/socketapi/v1/
   RECORDINGS_DIR=<Bria sin opptaksmappe fra IT>
   LOG_LEVEL=debug
   ```
3. Kjør broen fra terminal (så vi ser loggen).
4. Be selgeren ta en testsamtale (Guide C).
5. Sjekk: broen logger `started/answered/ended`, og samtalen vises i CRM →
   Dashbord → «Sist ringt».
6. **Ser du avvik i debug-loggen** (Bria formaterer meldingene annerledes):
   kopier loggen og send til meg – jeg retter på minutter, du starter broen på
   nytt.

---

## 🛠️ Guide B – Deres IT

På **test-PC-en** (den ene vi tester på først):

1. **Sjekk Bria-versjon:** Bria → Help/meny → «About Bria». Må være **5.0+**
   (5.3+ anbefalt) og **Enterprise**.
2. **Slå på API-tilgang:** Bria → **Preferences → Application → Security** →
   *«When an application requests Bria Enterprise API access»* → velg
   **«Allow access always»**.
3. **Slå på samtaleopptak:** i Bria-innstillingene → skru på opptak, og **noter
   hvilken mappe** opptakene lagres i (vi trenger stien).
4. **Bekreft at Bria kan ringe** (registrert mot telefonkontoen deres).
5. **Installasjon:** tillat at vi legger et lite bakgrunnsprogram («broen») på
   maskinen. Senere settes det til å starte automatisk på alle PC-ene.

Det er alt fra deres side – resten gjør vi.

---

## 📞 Guide C – Selgeren

Du trenger ikke gjøre noe teknisk. Når vi sier fra:

1. Ring et vanlig nummer fra Bria (f.eks. en mobil).
2. Svar, snakk i ~10 sekunder.
3. Legg på.

Det er alt. Vi ser at samtalen dukker opp i CRM-en. 🙌

---

## Etter en vellykket test
- Rull broen ut til de andre PC-ene (samme `.env`, men riktig `AGENT_ID` per
  selger) og sett den til å **starte automatisk**.
- Da er telefoni + transkript live for hele teamet.
