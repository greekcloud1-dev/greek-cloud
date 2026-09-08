export type Uuid = string;
export type IsoDateTime = string;

export type CrmRole = "admin" | "agent";

export type ServiceKind =
  "medical_concierge" | "document_translation" | "other";

export type CaseStage =
  | "new"
  | "contacted"
  | "collecting_details"
  | "ready"
  | "in_progress"
  | "waiting"
  | "completed"
  | "closed";

export type WaitingOn = "customer" | "team" | "external" | "other";

export type LeadSource =
  | "website"
  | "whatsapp"
  | "manual"
  | "google_ads"
  | "meta_ads"
  | "referral"
  | "other";

export type PreferredChannel = "whatsapp" | "phone" | "email";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type CurrencyCode = "EUR" | "ILS";

export type TaskKind =
  "call" | "whatsapp" | "email" | "follow_up" | "admin" | "other";

export type TaskPriority = "normal" | "high" | "urgent";

export type ActivityKind =
  | "lead_received"
  | "case_created"
  | "stage_changed"
  | "assignment_changed"
  | "contact_attempt"
  | "note_added"
  | "task_created"
  | "task_completed"
  | "payment_status_changed"
  | "flight_changed"
  | "whatsapp_opened";

export type ActivityChannel = "system" | "whatsapp" | "phone" | "email";

export type MessageTemplateChannel = "whatsapp" | "email";

export type NotificationEvent =
  | "new_case"
  | "assignment"
  | "task_due"
  | "task_overdue"
  | "flight_14d"
  | "flight_7d"
  | "flight_72h"
  | "flight_24h"
  | "stale_case"
  | "integration_failed";

export type NotificationChannel = "in_app" | "email" | "telegram";
export type NotificationSeverity = "info" | "warning" | "urgent";
export type DeliveryStatus = "queued" | "sent" | "failed" | "skipped";
export type OutboxStatus = "queued" | "processing" | "processed" | "failed";

export type FlightUrgency =
  | "none"
  | "passed"
  | "within_24_hours"
  | "within_72_hours"
  | "within_7_days"
  | "within_14_days"
  | "later";

export type ActivityMetadataValue = string | number | boolean | null;
export type ActivityMetadata = Record<string, ActivityMetadataValue>;

export interface CrmProfile {
  id: Uuid;
  displayName: string;
  email: string;
  role: CrmRole;
  active: boolean;
  telegramChatId?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Contact {
  id: Uuid;
  fullName: string;
  phoneE164: string;
  email?: string;
  preferredChannel: PreferredChannel;
  whatsappOptInAt?: IsoDateTime;
  whatsappOptInSource?: string;
  createdBy?: Uuid;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ClientCase {
  id: Uuid;
  referenceNo: string;
  contactId: Uuid;
  service: ServiceKind;
  stage: CaseStage;
  waitingOn?: WaitingOn;
  ownerId?: Uuid;
  source: LeadSource;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  flightAtUtc?: IsoDateTime;
  flightTimezone?: string;
  priceMinor?: number;
  currency?: CurrencyCode;
  paymentStatus: PaymentStatus;
  closedReason?: string;
  completedAt?: IsoDateTime;
  createdBy?: Uuid;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CrmTask {
  id: Uuid;
  caseId: Uuid;
  assigneeId: Uuid;
  kind: TaskKind;
  title: string;
  dueAt: IsoDateTime;
  remindAt?: IsoDateTime;
  priority: TaskPriority;
  completedAt?: IsoDateTime;
  createdBy?: Uuid;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Activity {
  id: Uuid;
  caseId: Uuid;
  contactId: Uuid;
  actorId?: Uuid;
  kind: ActivityKind;
  channel?: ActivityChannel;
  summary?: string;
  metadata: ActivityMetadata;
  createdAt: IsoDateTime;
}

export interface MessageTemplate {
  id: Uuid;
  key: string;
  channel: MessageTemplateChannel;
  name: string;
  body: string;
  active: boolean;
  applicableStages: CaseStage[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface NotificationPreference {
  profileId: Uuid;
  event: NotificationEvent;
  inApp: boolean;
  email: boolean;
  telegram: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Notification {
  id: Uuid;
  dedupeKey: string;
  recipientId: Uuid;
  event: NotificationEvent;
  caseId?: Uuid;
  taskId?: Uuid;
  severity: NotificationSeverity;
  title: string;
  body: string;
  actionHref: string;
  readAt?: IsoDateTime;
  createdAt: IsoDateTime;
}

export interface NotificationDelivery {
  id: Uuid;
  notificationId: Uuid;
  channel: NotificationChannel;
  status: DeliveryStatus;
  attempts: number;
  providerMessageId?: string;
  sentAt?: IsoDateTime;
  nextAttemptAt?: IsoDateTime;
  lastError?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface OutboxEvent {
  id: Uuid;
  event: NotificationEvent;
  aggregateType: "case" | "task" | "system";
  aggregateId?: Uuid;
  dedupeKey: string;
  payload: ActivityMetadata;
  status: OutboxStatus;
  attempts: number;
  availableAt: IsoDateTime;
  lockedAt?: IsoDateTime;
  processedAt?: IsoDateTime;
  lastError?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
