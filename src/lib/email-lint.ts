// ============================================================================
//  Enkel forhåndskontroll av en e-post før utsendelse. Gjenbrukes både
//  klient-side (umiddelbar tilbakemelding i ContractsPanel) og server-side
//  (defense-in-depth + logging i /api/contracts/send).
//
//  Dette er hjelpesignaler for å luke ut de vanligste feilene — IKKE en
//  garanti mot at meldingen havner i søppelpost. Presenter det aldri slik.
// ============================================================================

export interface EmailLintInput {
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | null;
  fromAddress?: string | null;
}

export interface EmailLintWarning {
  code: string;
  message: string;
}

const SPAM_PHRASES = [
  "gratis",
  "helt gratis",
  "klikk her",
  "klikk nå",
  "begrenset tilbud",
  "kun i dag",
  "hast",
  "haster",
  "vinn",
  "gevinst",
  "100% gratis",
  "ikke gå glipp av",
];

const URL_SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "t.co",
  "ow.ly",
  "is.gd",
  "buff.ly",
];

function extractLinks(html: string): string[] {
  const matches = [...html.matchAll(/href=["']([^"']+)["']/gi)];
  return matches.map((m) => m[1]);
}

export function lintEmail(input: EmailLintInput): EmailLintWarning[] {
  const warnings: EmailLintWarning[] = [];
  const subject = input.subject.trim();
  const html = input.html;
  const text = input.text?.trim() ?? "";
  const links = extractLinks(html);

  if (!subject) {
    warnings.push({ code: "subject_missing", message: "Mangler emnefelt." });
  } else {
    if (subject === subject.toUpperCase() && /[A-ZÆØÅ]/.test(subject)) {
      warnings.push({
        code: "subject_all_caps",
        message: "Emnet er skrevet med bare store bokstaver — oppfattes ofte som spam.",
      });
    }
    if ((subject.match(/!/g) ?? []).length > 1) {
      warnings.push({
        code: "subject_exclamations",
        message: "Emnet har flere utropstegn — typisk for spam-filtre å reagere på.",
      });
    }
    if (subject.length > 78) {
      warnings.push({
        code: "subject_too_long",
        message: "Emnet er langt og kan bli avkuttet i innboksen.",
      });
    }
  }

  const haystack = `${subject} ${html}`.toLowerCase();
  for (const phrase of SPAM_PHRASES) {
    if (haystack.includes(phrase)) {
      warnings.push({
        code: "spam_phrase",
        message: `Inneholder en formulering («${phrase}») som ofte trigger spamfilter.`,
      });
      break; // én advarsel er nok, ikke spam warnings om spam-ord
    }
  }

  if (!text) {
    warnings.push({
      code: "missing_text_version",
      message: "Mangler ren tekst-versjon (kun HTML) — svekker leveringsgraden.",
    });
  }

  if (!input.replyTo?.trim()) {
    warnings.push({
      code: "missing_reply_to",
      message: "Ingen svaradresse satt — mottakere bør kunne svare på meldingen.",
    });
  }

  if (links.length > 5) {
    warnings.push({
      code: "too_many_links",
      message: `${links.length} lenker i meldingen — vurder å redusere til én tydelig handling.`,
    });
  }

  for (const link of links) {
    if (URL_SHORTENERS.some((s) => link.includes(s))) {
      warnings.push({
        code: "url_shortener",
        message: `Lenke bruker en URL-forkorter (${link}) — unngå dette, det er et sterkt spamsignal.`,
      });
    }
  }

  const imgTags = [...html.matchAll(/<img[^>]*>/gi)];
  const base64Imgs = imgTags.filter((m) => /src=["']data:image/i.test(m[0]));
  if (base64Imgs.length > 0) {
    warnings.push({
      code: "inline_base64_image",
      message: "Innebygde (base64) bilder gjør meldingen unødvendig stor — bruk en lenket URL i stedet.",
    });
  }

  return warnings;
}
