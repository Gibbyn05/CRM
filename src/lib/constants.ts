import type {
  AgentStatus,
  AppointmentType,
  BillingInterval,
  ContractStatus,
  DealStage,
  SigningEventType,
  TemplateType,
} from "./types";

// Norske etiketter og farger for status/steg brukt i UI.

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  in_call: "I samtale",
  available: "Ledig",
  not_in_call: "Ikke i samtale",
  offline: "Frakoblet",
};

export const AGENT_STATUS_COLORS: Record<AgentStatus, string> = {
  in_call: "bg-status-incall",
  available: "bg-status-idle",
  not_in_call: "bg-status-notincall",
  offline: "bg-status-offline",
};

export const DEAL_STAGES: DealStage[] = [
  "ringt",
  "tilbud_sendt",
  "akseptert",
  "tapt",
];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  ringt: "Ringt",
  tilbud_sendt: "Tilbud sendt",
  akseptert: "Akseptert",
  tapt: "Tapt",
};

export const DEAL_STAGE_COLORS: Record<DealStage, string> = {
  ringt: "border-slate-400",
  tilbud_sendt: "border-amber-400",
  akseptert: "border-green-500",
  tapt: "border-red-500",
};

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  oppfolgingsmote: "Oppfølgingsmøte",
  demo: "Demo",
  kontraktssignering: "Kontraktssignering",
  forstegangsmote: "Førstegangsmøte",
  annet: "Annet",
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Kladd",
  sent: "Sendt",
  opened: "Åpnet",
  signed: "Signert",
  declined: "Avslått",
};

// "Utløpt" er ikke en egen contract_status-verdi (se migrasjon 0010) – den
// beregnes fra expired_at og vises med denne etiketten/fargen i UI.
export const CONTRACT_EXPIRED_LABEL = "Utløpt";

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  draft: "bg-slate-200 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  opened: "bg-amber-100 text-amber-700",
  signed: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
};

export const CONTRACT_EXPIRED_COLOR = "bg-slate-300 text-slate-600";

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  month: "Per måned",
  year: "Per år",
  once: "Engangs",
};

export const BILLING_INTERVAL_SHORT: Record<BillingInterval, string> = {
  month: "/mnd",
  year: "/år",
  once: "",
};

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  contract: "Kontrakt",
  email: "E-post",
};

export const SIGNING_EVENT_LABELS: Record<SigningEventType, string> = {
  created: "Opprettet",
  sent: "Sendt",
  opened: "Åpnet",
  signed: "Signert",
  declined: "Avslått",
  expired: "Utløpt",
  resent: "Sendt på nytt",
};
