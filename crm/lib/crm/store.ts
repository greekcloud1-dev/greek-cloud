import "server-only";

import { z } from "zod";
import type {
  CaseActivity,
  CaseStatus,
  ClientCase,
  CrmTask,
  PaymentStatus,
} from "@/components/crm/crm-data";
import { getCrmAuthState, type CrmUser } from "./auth";
import { createClient } from "@/lib/supabase/server";
import type { CaseStage, LeadSource, ServiceKind } from "./types";
import { buildWeeklyLeads } from "./weekly";

export class CrmStoreError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const stages: Record<CaseStage, CaseStatus> = {
  new: "חדש",
  contacted: "נוצר קשר",
  collecting_details: "איסוף פרטים",
  ready: "מוכן לטיפול",
  in_progress: "בטיפול",
  waiting: "בהמתנה",
  completed: "הושלם",
  closed: "נסגר ללא השלמה",
};
const stageValues = Object.keys(stages) as CaseStage[];
const payments: Record<string, PaymentStatus> = {
  unpaid: "לא שולם",
  paid: "שולם",
  refunded: "החזר",
};
const services: Record<ServiceKind, string> = {
  medical_concierge: "ליווי תפעולי",
  document_translation: "תרגום מסמכים",
  other: "אחר",
};
/* Carried across the website bridge. Only cases that came from the public
   intake form have these, so an unknown key is an empty label, never "אחר". */
const plans: Record<string, string> = {
  standard: "סטנדרט",
  vip: "VIP",
};
const localeLabels: Record<string, string> = {
  he: "עברית",
  en: "אנגלית",
};
const sources: Record<LeadSource, string> = {
  website: "האתר",
  whatsapp: "וואטסאפ",
  manual: "הזנה ידנית",
  google_ads: "פרסום בגוגל",
  meta_ads: "פרסום במטא",
  referral: "המלצה",
  other: "אחר",
};
const zone = "Asia/Jerusalem";
const dateFormat = new Intl.DateTimeFormat("he-IL", {
  timeZone: zone,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("he-IL", {
  timeZone: zone,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type Row = Record<string, unknown>;
function str(row: Row, key: string, fallback = "") {
  return typeof row[key] === "string" ? (row[key] as string) : fallback;
}
function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "צ"
  );
}
function relative(iso: string | null, now: number) {
  if (!iso) return "טרם נוצר קשר";
  const minutes = Math.max(
    0,
    Math.floor((now - new Date(iso).getTime()) / 60000),
  );
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דקות`;
  if (minutes < 1440) return `לפני ${Math.floor(minutes / 60)} שעות`;
  return `לפני ${Math.floor(minutes / 1440)} ימים`;
}
function dueLabel(iso: string, now: number) {
  const date = new Date(iso);
  return dayFormat.format(date) === dayFormat.format(now)
    ? `היום · ${timeFormat.format(date)}`
    : `${dateFormat.format(date)} · ${timeFormat.format(date)}`;
}

async function context() {
  const auth = await getCrmAuthState();
  if (auth.status === "setup")
    throw new CrmStoreError(503, "החיבור למסד הנתונים טרם הוגדר.");
  if (auth.status !== "authenticated")
    throw new CrmStoreError(401, "נדרשת כניסה של איש צוות פעיל.");
  return { supabase: await createClient(), user: auth.user };
}

function requireSuccess(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501")
    throw new CrmStoreError(403, "אין הרשאה לביצוע הפעולה.");
  if (error.code === "23503")
    throw new CrmStoreError(400, "התיק או איש הצוות שנבחרו אינם זמינים.");
  if (error.code === "23505")
    throw new CrmStoreError(409, "מספר הטלפון כבר משויך לאיש קשר אחר.");
  if (["23514", "22023", "22P02"].includes(error.code ?? ""))
    throw new CrmStoreError(400, "הפרטים אינם תקינים. יש לבדוק ולנסות שוב.");
  throw new CrmStoreError(
    503,
    "לא ניתן להשלים את הפעולה במסד הנתונים כרגע. יש לנסות שוב.",
  );
}

async function loadRows(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { code?: string } | null }>,
  limit = 10000,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset < limit; offset += 1000) {
    const result = await fetchPage(offset, offset + 999);
    requireSuccess(result.error);
    const page = (result.data ?? []) as Row[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  const check = await fetchPage(limit, limit);
  requireSuccess(check.error);
  if (check.data?.length)
    throw new CrmStoreError(
      503,
      "נפח הנתונים מחייב הרחבת תצוגת המערכת. לא הוצגו נתונים חלקיים.",
    );
  return rows;
}

const activityLabels: Record<string, string> = {
  lead_received: "התקבלה פנייה",
  case_created: "נפתח תיק",
  stage_changed: "עודכן שלב הטיפול",
  assignment_changed: "עודכן איש הצוות המטפל",
  contact_attempt: "תועד ניסיון יצירת קשר",
  note_added: "נוספה הערה",
  task_created: "נוספה משימה",
  task_completed: "הושלמה משימה",
  payment_status_changed: "עודכן סטטוס התשלום",
  flight_changed: "עודכן מועד הטיסה",
  whatsapp_opened: "נפתחה שיחת וואטסאפ",
};

/** All database access uses the signed-in user's client and RLS. */
export async function loadCrmData() {
  const { supabase, user } = await context();
  const [
    caseRows,
    contactRows,
    taskRows,
    activityRows,
    notificationRows,
    profileRows,
    preferenceRows,
  ] = await Promise.all([
    loadRows((from, to) =>
      supabase
        .from("crm_cases")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    loadRows((from, to) =>
      supabase
        .from("crm_contacts")
        .select("id,full_name,phone_e164,email,preferred_channel,locale")
        .order("id")
        .range(from, to),
    ),
    loadRows((from, to) =>
      supabase
        .from("crm_tasks")
        .select("*")
        .order("due_at")
        .order("id")
        .range(from, to),
    ),
    loadRows(
      (from, to) =>
        supabase
          .from("crm_activities")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      50000,
    ),
    loadRows((from, to) =>
      supabase
        .from("crm_notifications")
        .select("*")
        .eq("recipient_id", user.id)
        .eq("in_app_enabled", true)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    loadRows((from, to) =>
      supabase
        .from("crm_profiles")
        .select("id,display_name,role,active")
        .eq("active", true)
        .order("id")
        .range(from, to),
    ),
    loadRows((from, to) =>
      supabase
        .from("crm_notification_preferences")
        .select("event,in_app,email,telegram")
        .eq("profile_id", user.id)
        .order("event")
        .range(from, to),
    ),
  ]);
  const now = Date.now();
  const contacts = new Map(contactRows.map((row) => [str(row, "id"), row]));
  const profiles = new Map(profileRows.map((row) => [str(row, "id"), row]));
  const caseTasks = new Map<string, Row[]>();
  for (const row of taskRows) {
    const id = str(row, "case_id");
    caseTasks.set(id, [...(caseTasks.get(id) ?? []), row]);
  }
  const caseActivities = new Map<string, Row[]>();
  for (const row of activityRows) {
    const id = str(row, "case_id");
    caseActivities.set(id, [...(caseActivities.get(id) ?? []), row]);
  }
  const clients: ClientCase[] = caseRows.map((row) => {
    const id = str(row, "id");
    const contact = contacts.get(str(row, "contact_id")) ?? {};
    const owner = profiles.get(str(row, "owner_id"));
    const timeline = caseActivities.get(id) ?? [];
    const openTasks = (caseTasks.get(id) ?? []).filter(
      (task) => !task.completed_at,
    );
    const next = openTasks[0];
    const flightAt = str(row, "flight_at") || null;
    const flight = flightAt ? new Date(flightAt) : null;
    const remainingHours = flight ? (flight.getTime() - now) / 3600000 : null;
    const remainingLabel =
      remainingHours === null
        ? "אין תאריך טיסה"
        : remainingHours <= 0
          ? "מועד הטיסה עבר"
          : remainingHours < 1
            ? "בעוד פחות משעה"
            : remainingHours < 48
              ? `בעוד ${Math.ceil(remainingHours)} שעות`
              : `בעוד ${Math.ceil(remainingHours / 24)} ימים`;
    const stage = str(row, "stage") as CaseStage;
    const allTasks = caseTasks.get(id) ?? [];
    const readiness = allTasks.length
      ? Math.round(
          ((allTasks.length - openTasks.length) / allTasks.length) * 100,
        )
      : 0;
    const activities: CaseActivity[] = timeline.slice(0, 50).map((activity) => {
      const meta = (activity.metadata ?? {}) as Row;
      const kind = str(activity, "kind");
      const label =
        str(activity, "summary") ||
        (kind === "stage_changed"
          ? `שלב הטיפול עודכן ל${stages[str(meta, "to") as CaseStage] ?? "שלב חדש"}`
          : kind === "payment_status_changed"
            ? `סטטוס התשלום עודכן ל${payments[str(meta, "to")] ?? "סטטוס חדש"}`
            : (activityLabels[kind] ?? "עודכן התיק"));
      const actor = profiles.get(str(activity, "actor_id"));
      return {
        id: str(activity, "id"),
        label,
        meta: `${dueLabel(str(activity, "created_at"), now)}${actor ? ` · ${str(actor, "display_name")}` : ""}`,
        tone:
          str(activity, "channel") === "phone"
            ? "call"
            : str(activity, "channel") === "whatsapp"
              ? "message"
              : "system",
      };
    });
    const latestContact = timeline.find(
      (activity) => str(activity, "kind") === "contact_attempt",
    );
    return {
      id,
      referenceNo: str(row, "reference_no"),
      contactId: str(row, "contact_id"),
      ownerId: str(row, "owner_id"),
      flightAt,
      createdAt: str(row, "created_at"),
      stage,
      waitingOn: str(row, "waiting_on") || undefined,
      preferredChannel: str(contact, "preferred_channel"),
      name: str(contact, "full_name", "איש קשר"),
      initials: initials(str(contact, "full_name")),
      phone: str(contact, "phone_e164"),
      phoneLink: str(contact, "phone_e164").replace(/^\+/, ""),
      email: str(contact, "email"),
      destination: str(row, "destination", "טרם נקבע"),
      /* What the customer submitted on the public form, carried across the
         bridge. Absent on cases created by staff or through /request, which is
         why each falls back to nothing rather than to a placeholder. */
      intakePlan: plans[str(row, "intake_plan")] ?? "",
      intakeArrival: str(row, "intake_arrival_on")
        ? dateFormat.format(new Date(`${str(row, "intake_arrival_on")}T12:00:00Z`))
        : "",
      contactLocale: localeLabels[str(contact, "locale")] ?? "",
      service: services[str(row, "service") as ServiceKind] ?? "אחר",
      source: sources[str(row, "source") as LeadSource] ?? "אחר",
      owner: owner ? str(owner, "display_name") : "ללא שיוך",
      status: stages[stage] ?? "חדש",
      payment: payments[str(row, "payment_status")] ?? "לא שולם",
      flightDate: flight ? dateFormat.format(flight) : "טרם נקבע",
      flightTime: flight ? timeFormat.format(flight) : "—",
      remainingHours,
      remainingLabel,
      nextAction: next ? str(next, "title") : "אין משימה פתוחה",
      nextActionDue: next ? dueLabel(str(next, "due_at"), now) : "—",
      lastContact: relative(
        latestContact ? str(latestContact, "created_at") : null,
        now,
      ),
      readiness,
      activities,
    };
  });
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  const tasks: CrmTask[] = taskRows.map((row) => ({
    id: str(row, "id"),
    clientId: str(row, "case_id"),
    client: clientMap.get(str(row, "case_id"))?.name ?? "איש קשר",
    title: str(row, "title"),
    due: dueLabel(str(row, "due_at"), now),
    dueAt: str(row, "due_at"),
    bucket:
      new Date(str(row, "due_at")).getTime() < now
        ? "באיחור"
        : dayFormat.format(new Date(str(row, "due_at"))) ===
            dayFormat.format(now)
          ? "היום"
          : "בהמשך",
    completed: Boolean(row.completed_at),
  }));
  const notifications = notificationRows.map((row) => ({
    id: str(row, "id"),
    clientId: str(row, "case_id"),
    title: str(row, "title"),
    detail: str(row, "body"),
    time: relative(str(row, "created_at"), now),
    urgent: str(row, "severity") === "urgent",
  }));
  const completed = clients.filter(
    (client) => client.stage === "completed",
  ).length;
  const closed = clients.filter((client) => client.stage === "closed").length;
  const firstResponses = caseRows.flatMap((row) => {
    const attempts = (caseActivities.get(str(row, "id")) ?? []).filter(
      (activity) => str(activity, "kind") === "contact_attempt",
    );
    const first = attempts.at(-1);
    return first
      ? [
          Math.max(
            0,
            (new Date(str(first, "created_at")).getTime() -
              new Date(str(row, "created_at")).getTime()) /
              60000,
          ),
        ]
      : [];
  });
  const averageFirstResponseMinutes = firstResponses.length
    ? Math.round(
        firstResponses.reduce((sum, value) => sum + value, 0) /
          firstResponses.length,
      )
    : null;
  const dailyLeads = buildWeeklyLeads(
    caseRows.map((row) => str(row, "created_at")),
    now,
  );
  return {
    clients,
    tasks,
    notifications,
    user,
    staff: profileRows.map((row) => ({
      id: str(row, "id"),
      displayName: str(row, "display_name"),
      role: str(row, "role"),
    })),
    preferences: {
      email: preferenceRows.some((row) => row.email),
      telegram: preferenceRows.some((row) => row.telegram),
    },
    stats: {
      totalCases: clients.length,
      activeCases: clients.length - completed - closed,
      completedCases: completed,
      newCases: clients.filter((client) => client.stage === "new").length,
      unpaidCases: clients.filter((client) => client.payment === "לא שולם")
        .length,
      openTasks: tasks.filter((task) => !task.completed).length,
      overdueTasks: tasks.filter(
        (task) => !task.completed && task.bucket === "באיחור",
      ).length,
      flightsWithin72h: clients.filter(
        (client) =>
          client.remainingHours !== null &&
          client.remainingHours > 0 &&
          client.remainingHours <= 72 &&
          !["completed", "closed"].includes(client.stage ?? ""),
      ).length,
      completionRate:
        completed + closed
          ? Math.round((completed / (completed + closed)) * 100)
          : 0,
      averageFirstResponseMinutes,
      responseMinutes: averageFirstResponseMinutes,
      sourceBreakdown: Object.entries(sources)
        .map(([source, label], index) => {
          const count = caseRows.filter((row) => row.source === source).length;
          return {
            label,
            count,
            value: clients.length
              ? Math.round((count / clients.length) * 100)
              : 0,
            color: ["teal", "ink", "terracotta", "sand"][index % 4],
          };
        })
        .filter((source) => source.count),
      stageBreakdown: Object.entries(stages).map(([stage, label]) => ({
        label,
        count: caseRows.filter((row) => row.stage === stage).length,
      })),
      dailyLeads,
      truncated: false,
    },
  };
}

const uuid = z.uuid();
const optionalText = (max: number) => z.string().trim().max(max).optional();
const isoDate = z.iso.datetime({ offset: true });
const phone = z
  .string()
  .trim()
  .max(32)
  .transform((value) => {
    const normalized = value.replace(/[\s().-]/g, "");
    return /^0\d{8,9}$/.test(normalized)
      ? `+972${normalized.slice(1)}`
      : /^972\d{8,9}$/.test(normalized)
        ? `+${normalized}`
        : normalized;
  })
  .pipe(
    z
      .string()
      .regex(/^\+[1-9][0-9]{7,14}$/, "יש להזין מספר טלפון תקין, כולל קידומת."),
  );
const stageInput = z
  .string()
  .transform((value) => {
    const aliases: Record<string, string> = {
      "ליד חדש": "new",
      "ממתין לפרטים": "collecting_details",
      "מוכן לטיסה": "ready",
    };
    return stageValues.includes(value as CaseStage)
      ? value
      : (Object.entries(stages).find(([, label]) => label === value)?.[0] ??
          aliases[value] ??
          value);
  })
  .pipe(
    z.enum([
      "new",
      "contacted",
      "collecting_details",
      "ready",
      "in_progress",
      "waiting",
      "completed",
      "closed",
    ]),
  );
const paymentInput = z
  .string()
  .transform(
    (value) =>
      Object.entries(payments).find(([, label]) => label === value)?.[0] ??
      (value === "הוחזר" ? "refunded" : value),
  )
  .pipe(z.enum(["unpaid", "paid", "refunded"]));

export const crmMutationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create_case"),
      fullName: z.string().trim().min(1).max(160),
      phone,
      email: z.union([z.email().max(320), z.literal("")]).optional(),
      service: z.enum(["medical_concierge", "document_translation", "other"]),
      source: z
        .enum([
          "website",
          "whatsapp",
          "manual",
          "google_ads",
          "meta_ads",
          "referral",
          "other",
        ])
        .default("manual"),
      flightAt: isoDate.nullable().optional(),
      destination: optionalText(120),
    })
    .strict(),
  z
    .object({
      type: z.literal("update_case"),
      id: uuid,
      status: stageInput.optional(),
      payment: paymentInput.optional(),
      flightAt: isoDate.nullable().optional(),
      destination: optionalText(120),
      ownerId: uuid.nullable().optional(),
      waitingOn: z
        .enum(["customer", "team", "external", "other"])
        .nullable()
        .optional(),
      closedReason: optionalText(240),
    })
    .strict(),
  z
    .object({
      type: z.literal("toggle_task"),
      id: uuid,
      completed: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("create_task"),
      caseId: uuid,
      title: z.string().trim().min(1).max(200),
      dueAt: isoDate,
    })
    .strict(),
  z
    .object({
      type: z.literal("add_note"),
      caseId: uuid,
      note: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("log_contact"),
      caseId: uuid,
      channel: z.enum(["phone", "whatsapp", "email"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("update_contact"),
      contactId: uuid,
      fullName: z.string().trim().min(1).max(160),
      phone,
      email: z.union([z.email().max(320), z.literal("")]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("dismiss_notifications"),
      ids: z.array(uuid).max(100).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("save_preferences"),
      email: z.boolean(),
      telegram: z.boolean(),
    })
    .strict(),
]);

export async function mutateCrm(
  input: unknown,
): Promise<{ ok: true; caseId?: string }> {
  const parsed = crmMutationSchema.safeParse(input);
  if (!parsed.success)
    throw new CrmStoreError(
      400,
      parsed.error.issues[0]?.message.startsWith("יש להזין")
        ? parsed.error.issues[0].message
        : "יש לבדוק שכל הפרטים מולאו בצורה תקינה.",
    );
  const mutation = parsed.data;
  const { supabase, user } = await context();
  if (mutation.type === "create_case") {
    const { data, error } = await supabase.rpc("crm_staff_create_case", {
      p_full_name: mutation.fullName,
      p_phone_e164: mutation.phone,
      p_service: mutation.service,
      p_source: mutation.source,
      p_email: mutation.email || null,
      p_flight_at: mutation.flightAt ?? null,
      p_destination: mutation.destination || null,
    });
    requireSuccess(error);
    if (typeof data !== "string")
      throw new CrmStoreError(503, "לא התקבל אישור לפתיחת התיק.");
    return { ok: true, caseId: data };
  }
  if (mutation.type === "update_case") {
    const update: Row = {};
    if (mutation.status !== undefined) {
      update.stage = mutation.status;
      update.waiting_on =
        mutation.status === "waiting"
          ? (mutation.waitingOn ?? "customer")
          : null;
      update.completed_at =
        mutation.status === "completed" ? new Date().toISOString() : null;
      update.closed_reason =
        mutation.status === "closed"
          ? mutation.closedReason || "נסגר על ידי הצוות"
          : null;
    } else if (mutation.waitingOn !== undefined)
      update.waiting_on = mutation.waitingOn;
    if (mutation.payment !== undefined)
      update.payment_status = mutation.payment;
    if (mutation.flightAt !== undefined) {
      update.flight_at = mutation.flightAt;
      update.flight_timezone = mutation.flightAt ? zone : null;
    }
    if (mutation.destination !== undefined)
      update.destination = mutation.destination || null;
    if (mutation.ownerId !== undefined) {
      if (mutation.ownerId) {
        const { data, error } = await supabase
          .from("crm_profiles")
          .select("id")
          .eq("id", mutation.ownerId)
          .eq("active", true)
          .maybeSingle();
        requireSuccess(error);
        if (!data) throw new CrmStoreError(400, "איש הצוות אינו פעיל.");
      }
      update.owner_id = mutation.ownerId;
    }
    if (!Object.keys(update).length)
      throw new CrmStoreError(400, "לא נבחר שינוי לשמירה.");
    const { data, error } = await supabase
      .from("crm_cases")
      .update(update)
      .eq("id", mutation.id)
      .select("id")
      .maybeSingle();
    requireSuccess(error);
    if (!data) throw new CrmStoreError(404, "התיק לא נמצא.");
    return { ok: true, caseId: mutation.id };
  }
  if (mutation.type === "toggle_task") {
    const { data, error } = await supabase
      .from("crm_tasks")
      .update({
        completed_at: mutation.completed ? new Date().toISOString() : null,
      })
      .eq("id", mutation.id)
      .select("id,case_id")
      .maybeSingle();
    requireSuccess(error);
    if (!data) throw new CrmStoreError(404, "המשימה לא נמצאה.");
    return { ok: true, caseId: data.case_id };
  }
  if (mutation.type === "update_contact") {
    const contactUpdate: Row = {
      full_name: mutation.fullName,
      phone_e164: mutation.phone,
    };
    if (mutation.email !== undefined)
      contactUpdate.email = mutation.email || null;
    const { data, error } = await supabase
      .from("crm_contacts")
      .update(contactUpdate)
      .eq("id", mutation.contactId)
      .select("id")
      .maybeSingle();
    requireSuccess(error);
    if (!data) throw new CrmStoreError(404, "איש הקשר לא נמצא.");
    return { ok: true };
  }
  if (
    mutation.type === "create_task" ||
    mutation.type === "add_note" ||
    mutation.type === "log_contact"
  ) {
    const { data: clientCase, error: caseError } = await supabase
      .from("crm_cases")
      .select("id,contact_id,owner_id")
      .eq("id", mutation.caseId)
      .maybeSingle();
    requireSuccess(caseError);
    if (!clientCase) throw new CrmStoreError(404, "התיק לא נמצא.");
    if (mutation.type === "create_task") {
      const { error } = await supabase
        .from("crm_tasks")
        .insert({
          case_id: mutation.caseId,
          assignee_id: user.id,
          kind: "follow_up",
          title: mutation.title,
          due_at: mutation.dueAt,
        });
      requireSuccess(error);
    } else if (mutation.type === "add_note") {
      const { error } = await supabase
        .from("crm_activities")
        .insert({
          case_id: mutation.caseId,
          contact_id: clientCase.contact_id,
          kind: "note_added",
          channel: "system",
          summary: mutation.note,
        });
      requireSuccess(error);
    } else {
      const { error } = await supabase
        .from("crm_activities")
        .insert({
          case_id: mutation.caseId,
          contact_id: clientCase.contact_id,
          kind: "contact_attempt",
          channel: mutation.channel,
          summary: "תועדה יצירת קשר על ידי הצוות",
        });
      requireSuccess(error);
    }
    return { ok: true, caseId: mutation.caseId };
  }
  if (mutation.type === "save_preferences") {
    const { data, error } = await supabase
      .from("crm_notification_preferences")
      .update({
        in_app: true,
        email: mutation.email,
        telegram: mutation.telegram,
      })
      .eq("profile_id", user.id)
      .select("event");
    requireSuccess(error);
    if (!data?.length)
      throw new CrmStoreError(503, "העדפות ההתראות של החשבון טרם אותחלו.");
    return { ok: true };
  }
  let query = supabase
    .from("crm_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
  if (mutation.ids) {
    if (!mutation.ids.length) return { ok: true };
    query = query.in("id", mutation.ids);
  }
  const { error } = await query;
  requireSuccess(error);
  return { ok: true };
}

export type CrmData = Awaited<ReturnType<typeof loadCrmData>>;
export type { CrmUser };
