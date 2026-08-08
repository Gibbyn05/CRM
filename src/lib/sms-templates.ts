import { formatDateInTimeZone, formatTimeInTimeZone } from "@/lib/format";

// ============================================================================
//  Rendering av SMS-avtalepåminnelser. Rene funksjoner (ingen nettverk/DB) —
//  gjenbrukes av forhåndsvisningen i innstillingene, dispatch-jobben og
//  vitest-testene.
// ============================================================================

export interface ReminderTemplateVars {
  kundenavn: string;
  selgernavn: string;
  dato: string;
  klokkeslett: string;
  sted: string;
  bedrift: string;
}

export const DEFAULT_TEMPLATE_CUSTOMER =
  "Hei {{kundenavn}}! Påminnelse om avtale med {{selgernavn}} i {{bedrift}} {{dato}} kl. {{klokkeslett}}{{#sted}} ({{sted}}){{/sted}}.";

export const DEFAULT_TEMPLATE_AGENT =
  "Påminnelse: avtale med {{kundenavn}} {{dato}} kl. {{klokkeslett}}{{#sted}} ({{sted}}){{/sted}}.";

export function buildReminderVars(opts: {
  customerName: string;
  agentName: string;
  startsAtIso: string;
  location: string | null;
  orgName: string;
  timeZone: string;
}): ReminderTemplateVars {
  return {
    kundenavn: opts.customerName,
    selgernavn: opts.agentName,
    dato: formatDateInTimeZone(opts.startsAtIso, opts.timeZone),
    klokkeslett: formatTimeInTimeZone(opts.startsAtIso, opts.timeZone),
    sted: opts.location ?? "",
    bedrift: opts.orgName,
  };
}

// Enkel variabel-erstatning + valgfrie seksjoner ({{#felt}}...{{/felt}} vises
// kun hvis feltet har innhold, f.eks. for å hoppe over "(sted)" når stedet
// mangler). Bevisst minimal — ingen malmotor-avhengighet for noen få variabler.
export function renderTemplate(template: string, vars: ReminderTemplateVars): string {
  let out = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) => {
    const value = vars[key as keyof ReminderTemplateVars];
    return value ? inner : "";
  });
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = vars[key as keyof ReminderTemplateVars];
    return value ?? "";
  });
  return out.replace(/\s+/g, " ").trim();
}

export function renderReminderSms(
  template: string | null | undefined,
  recipientType: "customer" | "agent",
  vars: ReminderTemplateVars,
): string {
  const t =
    template?.trim() ||
    (recipientType === "customer" ? DEFAULT_TEMPLATE_CUSTOMER : DEFAULT_TEMPLATE_AGENT);
  return renderTemplate(t, vars);
}
