import type {
  CaseStage,
  FlightUrgency,
  LeadSource,
  NotificationChannel,
  NotificationEvent,
  PaymentStatus,
  PreferredChannel,
  ServiceKind,
  TaskKind,
  TaskPriority,
  WaitingOn,
} from "./types";

export interface CrmOption<T extends string> {
  value: T;
  label: string;
}

export const SERVICE_KIND_OPTIONS = [
  { value: "medical_concierge", label: "ליווי תפעולי" },
  { value: "document_translation", label: "תרגום מסמכים" },
  { value: "other", label: "אחר" },
] as const satisfies readonly CrmOption<ServiceKind>[];

export const CASE_STAGE_OPTIONS = [
  { value: "new", label: "חדש" },
  { value: "contacted", label: "נוצר קשר" },
  { value: "collecting_details", label: "איסוף פרטים" },
  { value: "ready", label: "מוכן לטיפול" },
  { value: "in_progress", label: "בטיפול" },
  { value: "waiting", label: "בהמתנה" },
  { value: "completed", label: "הושלם" },
  { value: "closed", label: "נסגר ללא השלמה" },
] as const satisfies readonly CrmOption<CaseStage>[];

export const CASE_STAGE_TRANSITIONS: Readonly<
  Record<CaseStage, readonly CaseStage[]>
> = {
  new: ["contacted", "closed"],
  contacted: ["collecting_details", "ready", "waiting", "closed"],
  collecting_details: ["ready", "waiting", "closed"],
  ready: ["in_progress", "waiting", "closed"],
  in_progress: ["waiting", "completed", "closed"],
  waiting: [
    "contacted",
    "collecting_details",
    "ready",
    "in_progress",
    "closed",
  ],
  completed: ["in_progress"],
  closed: ["new", "contacted"],
};

export const WAITING_ON_OPTIONS = [
  { value: "customer", label: "לקוח" },
  { value: "team", label: "צוות" },
  { value: "external", label: "גורם חיצוני" },
  { value: "other", label: "אחר" },
] as const satisfies readonly CrmOption<WaitingOn>[];

export const LEAD_SOURCE_OPTIONS = [
  { value: "website", label: "אתר" },
  { value: "whatsapp", label: "וואטסאפ" },
  { value: "manual", label: "הזנה ידנית" },
  { value: "google_ads", label: "פרסום בגוגל" },
  { value: "meta_ads", label: "פרסום במטא" },
  { value: "referral", label: "הפניה" },
  { value: "other", label: "אחר" },
] as const satisfies readonly CrmOption<LeadSource>[];

export const PREFERRED_CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "וואטסאפ" },
  { value: "phone", label: "טלפון" },
  { value: "email", label: "אימייל" },
] as const satisfies readonly CrmOption<PreferredChannel>[];

export const PAYMENT_STATUS_OPTIONS = [
  { value: "unpaid", label: "לא שולם" },
  { value: "paid", label: "שולם" },
  { value: "refunded", label: "הוחזר" },
] as const satisfies readonly CrmOption<PaymentStatus>[];

export const TASK_KIND_OPTIONS = [
  { value: "call", label: "שיחה" },
  { value: "whatsapp", label: "וואטסאפ" },
  { value: "email", label: "אימייל" },
  { value: "follow_up", label: "מעקב" },
  { value: "admin", label: "תפעול" },
  { value: "other", label: "אחר" },
] as const satisfies readonly CrmOption<TaskKind>[];

export const TASK_PRIORITY_OPTIONS = [
  { value: "normal", label: "רגילה" },
  { value: "high", label: "גבוהה" },
  { value: "urgent", label: "דחופה" },
] as const satisfies readonly CrmOption<TaskPriority>[];

export const FLIGHT_URGENCY_LABELS: Readonly<Record<FlightUrgency, string>> = {
  none: "לא הוגדר מועד",
  passed: "מועד הטיסה עבר",
  within_24_hours: "פחות מ־24 שעות",
  within_72_hours: "פחות מ־72 שעות",
  within_7_days: "פחות משבוע",
  within_14_days: "פחות משבועיים",
  later: "יותר משבועיים",
};

export const FLIGHT_ALERT_THRESHOLDS_HOURS = [336, 168, 72, 24] as const;

export const NOTIFICATION_EVENT_LABELS: Readonly<
  Record<NotificationEvent, string>
> = {
  new_case: "תיק חדש",
  assignment: "שיוך תיק",
  task_due: "משימה מתקרבת",
  task_overdue: "משימה באיחור",
  flight_14d: "טיסה בעוד שבועיים",
  flight_7d: "טיסה בעוד שבוע",
  flight_72h: "טיסה בתוך 72 שעות",
  flight_24h: "טיסה בתוך 24 שעות",
  stale_case: "תיק ללא פעילות",
  integration_failed: "תקלה בחיבור",
};

export const DEFAULT_NOTIFICATION_CHANNELS: Readonly<
  Record<NotificationEvent, readonly NotificationChannel[]>
> = {
  new_case: ["in_app", "email", "telegram"],
  assignment: ["in_app"],
  task_due: ["in_app", "email"],
  task_overdue: ["in_app", "email", "telegram"],
  flight_14d: ["in_app"],
  flight_7d: ["in_app", "email"],
  flight_72h: ["in_app", "email", "telegram"],
  flight_24h: ["in_app", "email", "telegram"],
  stale_case: ["in_app"],
  integration_failed: ["in_app", "email", "telegram"],
};

export const OPERATIONAL_NOTE_WARNING =
  "אין להזין מידע רפואי, מספרי דרכון או תוכן של מסמכים.";
