import type {
  AgentStatus,
  AppointmentType,
  ContractStatus,
  DealStage,
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
