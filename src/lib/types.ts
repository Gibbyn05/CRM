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
  sale_song_url: string | null;
  sale_song_start_seconds: number;
  sale_song_duration_seconds: number | null;
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
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  owner_id: string | null;
  created_by: string | null;
  fiken_contact_id: number | null;
  status_id: string | null;
  custom_info: CustomField[];
  created_at: string;
  updated_at: string;
}

export interface CustomField {
  label: string;
  value: string;
}

export interface CustomerFile {
  id: string;
  customer_id: string;
  name: string;
  path: string;
  size: number | null;
  mime: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface CustomerStatus {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

export type BillingType = "engang" | "lopende";

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  unit_label: string;
  tier: string;
  billing_type: BillingType;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealItem {
  id: string;
  deal_id: string;
  product_id: string | null;
  name: string;
  description: string | null;
  unit_price: number;
  quantity: number;
  billing_type: BillingType;
  agreement_start: string | null;
  agreement_end: string | null;
  line_total: number;
  created_at: string;
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
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  agent_id: string;
  customer_id: string | null;
  title: string;
  type: AppointmentType;
  event_type_id: string | null;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventType {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
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
  sign_token: string;
  contract_text: string | null;
  signer_name: string | null;
  signer_ip: string | null;
  created_at: string;
  updated_at: string;
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
  revenue_amount: number;
  new_customers_count: number;
  booked_meetings_count: number;
  summary_text: string | null;
  metrics: Record<string, unknown>;
  generated_at: string | null;
  created_at: string;
}

export interface DailyTeamReport {
  id: string;
  report_date: string;
  calls_count: number;
  meetings_confirmed: number;
  sales_count: number;
  rejections_count: number;
  revenue_amount: number;
  new_customers_count: number;
  booked_meetings_count: number;
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

export interface Organization {
  id: number;
  name: string;
  org_number: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  logo_url: string | null;
  email_signature: string | null;
  contract_footer: string | null;
  commission_rate: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CommissionStatus =
  | "ikke_fakturert"
  | "fakturert"
  | "betalt"
  | "forfalt"
  | "avskrevet";

export interface Commission {
  id: string;
  deal_id: string;
  agent_id: string | null;
  customer_id: string | null;
  sale_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: CommissionStatus;
  fiken_invoice_id: number | null;
  fiken_contact_id: number | null;
  fiken_draft_uuid: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PermissionResource = "customers" | "contracts" | "events" | "products";
export type PermissionAction = "view" | "create" | "edit" | "delete";

export interface RolePermission {
  role: UserRole;
  resource: PermissionResource;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  updated_at: string;
}

// Flat oppslagsmodell brukt i UI: perms[resource][action] === boolean.
export type PermissionMap = Record<
  PermissionResource,
  Record<PermissionAction, boolean>
>;

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
