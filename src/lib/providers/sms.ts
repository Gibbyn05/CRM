import { normalizePhoneNumber } from "@/lib/format";

// ============================================================================
//  Ryddig SMS-leverandør-adapter. Resten av systemet (dispatch-jobben,
//  test-send) kjenner kun til dette grensesnittet — å bytte leverandør er én
//  ny fil + peke SMS_PROVIDER dit, ingen andre steder trenger endres.
//
//  Konkret leverandør i dag: Sveve (norsk SMS-gateway, nevnt som forventet
//  leverandør flere steder i prosjektet fra før). Implementasjonen under
//  følger Sveves offentlig dokumenterte HTTP-API (bruker/passord + mottaker
//  + melding), men er IKKE verifisert mot en ekte konto i denne økten — test
//  alltid med «Send test-SMS» i Kommunikasjon-innstillingene før dere stoler
//  på det, og juster endepunkt/parametre mot Sveves gjeldende dokumentasjon
//  ved behov.
// ============================================================================

export interface SmsSendResult {
  ok: boolean;
  provider: string;
  provider_ref: string | null;
  // Skiller på om feilen er verdt å prøve igjen (nettverk/5xx) eller endelig
  // (f.eks. ugyldig nummer) — styrer retry-logikken i dispatch-jobben.
  transient: boolean;
  error?: string;
}

export interface SmsProvider {
  id: string;
  isConfigured(): boolean;
  send(to: string, body: string, from: string): Promise<SmsSendResult>;
}

// ----------------------------------------------------------------------------
//  Sveve (sveve.no) — enkelt REST-API. Miljøvariabler:
//    SVEVE_USER, SVEVE_PASSWORD, SMS_FROM (avsendernavn, maks 11 tegn)
// ----------------------------------------------------------------------------
const sveveProvider: SmsProvider = {
  id: "sveve",

  isConfigured() {
    return Boolean(process.env.SVEVE_USER && process.env.SVEVE_PASSWORD);
  },

  async send(to, body, from): Promise<SmsSendResult> {
    const user = process.env.SVEVE_USER;
    const password = process.env.SVEVE_PASSWORD;
    if (!user || !password) {
      return {
        ok: false,
        provider: "sveve",
        provider_ref: null,
        transient: false,
        error: "SMS-leverandør er ikke konfigurert (mangler SVEVE_USER/SVEVE_PASSWORD).",
      };
    }

    const params = new URLSearchParams({
      user,
      passwd: password,
      to,
      msg: body,
      f: from || "CRM",
    });

    try {
      const res = await fetch(`https://sveve.no/SMS/SendMessage?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const text = (await res.text()).trim();

      if (!res.ok) {
        return {
          ok: false,
          provider: "sveve",
          provider_ref: null,
          transient: res.status >= 500,
          error: `Sveve svarte ${res.status}: ${text.slice(0, 200)}`,
        };
      }

      // Sveve returnerer et statuskode-lignende svar (positivt tall = ok med
      // meldings-id, negativt = feilkode). Behandles konservativt: alt som
      // ikke tydelig ser ut som et positivt tall regnes som feil.
      const asNumber = Number(text.split(/\s|,/)[0]);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        return { ok: true, provider: "sveve", provider_ref: text, transient: false };
      }
      return {
        ok: false,
        provider: "sveve",
        provider_ref: null,
        transient: false,
        error: `Sveve avviste meldingen (svar: ${text.slice(0, 200)}).`,
      };
    } catch (e) {
      const m = e instanceof Error ? e.message : "Ukjent feil";
      return {
        ok: false,
        provider: "sveve",
        provider_ref: null,
        transient: true,
        error: `Kunne ikke kontakte Sveve: ${m}`,
      };
    }
  },
};

const PROVIDERS: Record<string, SmsProvider> = {
  sveve: sveveProvider,
};

export function getSmsProvider(): SmsProvider {
  const id = process.env.SMS_PROVIDER?.trim() || "sveve";
  return PROVIDERS[id] ?? sveveProvider;
}

export function isSmsConfigured(): boolean {
  return getSmsProvider().isConfigured();
}

// Sender én SMS. Validerer og normaliserer nummeret først slik at leverandøren
// aldri kalles med et åpenbart ugyldig format.
export async function sendSms(
  toRaw: string,
  body: string,
  fromName: string,
): Promise<SmsSendResult> {
  const to = normalizePhoneNumber(toRaw);
  if (!to) {
    return {
      ok: false,
      provider: getSmsProvider().id,
      provider_ref: null,
      transient: false,
      error: `Ugyldig telefonnummer: «${toRaw}».`,
    };
  }
  const provider = getSmsProvider();
  if (!provider.isConfigured()) {
    return {
      ok: false,
      provider: provider.id,
      provider_ref: null,
      transient: false,
      error: "SMS-leverandør er ikke konfigurert.",
    };
  }
  return provider.send(to, body, fromName);
}
