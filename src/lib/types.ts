// Delte TypeScript-typer som speiler Supabase-skjemaet.

export type UserRole = "agent" | "manager";

export type AgentStatus = "in_call" | "available" | "not_in_call" | "offline";

export type CallDirection = "inbound" | "outbound";
export type CallStatus = "ringing" | "answered" | "ended" | "missed";

export type DealStage = "ringt" | "tilbud_sendt" | "akseptert" | "tapt";

export type AppointmentType =
  | "oppfolgingsmote"
  | "demo"
  | "kontraktssignering"
  | "forstegangsmote"
  | "annet";

export type AppointmentStatus =
  | "planlagt"
  | "bekreftet"
  | "gjennomfort"
  | "avlyst"
  | "no_show";

export type ContractChannel = "email" | "sms";
export type ContractStatus = "draft" | "sent" | "opened" | "signed" | "declined";

export type BillingInterval = "month" | "year" | "once";
export type TemplateType = "contract" | "email";
export type SigningEventType =
  | "created"
  | "sent"
  | "opened"
  | "signed"
  | "declined"
  | "expired"
  | "resent";
export type SigningEventActor = "agent" | "customer" | "system";

export type NoteType = "call" | "general" | "system" | "meeting";
export type MessageChannel = "team" | "customer" | "direct";

export type NotificationType =
  | "message"
  | "reminder"
  | "contract"
  | "appointment"
  | "deal"
  | "system";

export type TranscriptSpeaker = "agent" | "customer" | "system";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  extension: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentState {
  agent_id: string;
  status: AgentStatus;
  current_call_id: string | null;
  last_call_started_at: string | null;
  last_call_ended_at: string | null;
  status_changed_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  org_number: string | null;
  contact_name: string | null;
  // Daglig leder, hentet fra Brønnøysundregisterets rolleoversikt (se
  // src/lib/company-lookup).
  ceo_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallLog {
  id: string;
  external_call_id: string | null;
  agent_id: string | null;
  customer_id: string | null;
  direction: CallDirection;
  status: CallStatus;
  phone_number: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  customer_id: string;
  author_id: string | null;
  call_log_id: string | null;
  note_type: NoteType;
  body: string;
  created_at: string;
}

export interface Deal {
  id: string;
  customer_id: string;
  agent_id: string | null;
  title: string;
  stage: DealStage;
  amount: number | null;
  currency: string;
  offer_sent_at: string | null;
  offer_accepted_at: string | null;
  lost_reason: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────
//  Produkt-/priskatalog og tilbudslinjer
// ─────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  billing_interval: BillingInterval;
  binding_months: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Produktlinje på et tilbud (deal). unit_price er en snapshot av
// standardprisen; override_price (om satt) er selgers overstyrte pris.
export interface DealItem {
  id: string;
  deal_id: string;
  product_id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  override_price: number | null;
  billing_interval: BillingInterval;
  binding_months: number | null;
  created_by: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
//  Kontrakt-/e-postmaler
// ─────────────────────────────────────────────────────────────

export interface ContractTemplate {
  id: string;
  name: string;
  type: TemplateType;
  subject: string | null;
  body: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  agent_id: string;
  customer_id: string | null;
  title: string;
  type: AppointmentType;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: string;
  customer_id: string;
  deal_id: string | null;
  agent_id: string | null;
  channel: ContractChannel;
  recipient: string;
  status: ContractStatus;
  sent_at: string | null;
  opened_at: string | null;
  signed_at: string | null;
  provider: string | null;
  provider_ref: string | null;
  document_url: string | null;
  contract_template_id: string | null;
  email_template_id: string | null;
  // Sikker, unik signeringslenke-token (se src/lib/tokens.ts). Aldri
  // eksponert til andre enn eieren av lenken.
  signing_token: string | null;
  token_expires_at: string | null;
  subject: string | null;
  document_body: string | null;
  email_body: string | null;
  org_number: string | null;
  advisor_name: string | null;
  total_amount: number | null;
  opened_ip: string | null;
  signed_ip: string | null;
  signed_by_name: string | null;
  signed_by_email: string | null;
  declined_at: string | null;
  declined_reason: string | null;
  // Satt av /api/contracts/expire når token_expires_at er passert uten
  // signering/avslag. status beholder siste reelle verdi (typisk sent/opened).
  expired_at: string | null;
  resend_count: number;
  created_at: string;
  updated_at: string;
}

// Kronologisk revisjonslogg for signeringsflyten til én kontrakt.
export interface ContractEvent {
  id: string;
  contract_id: string;
  event_type: SigningEventType;
  occurred_at: string;
  actor: SigningEventActor;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Message {
  id: string;
  author_id: string | null;
  channel: MessageChannel;
  customer_id: string | null;
  recipient_id: string | null;
  body: string;
  created_at: string;
}

export interface DailyReport {
  id: string;
  agent_id: string;
  report_date: string;
  calls_count: number;
  meetings_confirmed: number;
  sales_count: number;
  rejections_count: number;
  summary_text: string | null;
  metrics: Record<string, unknown>;
  generated_at: string | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  agent_id: string;
  customer_id: string | null;
  created_by: string | null;
  title: string;
  note: string | null;
  due_at: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface CallTranscript {
  id: string;
  call_log_id: string | null;
  external_call_id: string | null;
  agent_id: string | null;
  customer_id: string | null;
  speaker: TranscriptSpeaker;
  text: string;
  is_final: boolean;
  seq: number | null;
  spoken_at: string;
  created_at: string;
}

export interface LeaderboardRow {
  agent_id: string;
  full_name: string;
  calls_count: number;
  meetings_confirmed: number;
  sales_count: number;
  rejections_count: number;
  sales_amount: number;
}

// Sammensatt view-modell for live-tavla.
export interface LiveAgentRow {
  agent_id: string;
  full_name: string;
  status: AgentStatus;
  last_call_started_at: string | null;
  last_call_ended_at: string | null;
  status_changed_at: string;
}
