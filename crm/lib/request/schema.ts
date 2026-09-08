import { z } from "zod";

export const REQUEST_SERVICES = {
  medical_concierge: "ליווי ותיאום מול רופא ביוון",
  document_translation: "תרגום מסמכים",
  other: "בירור כללי",
} as const;

export const REQUEST_CHANNELS = {
  whatsapp: "וואטסאפ",
  phone: "שיחת טלפון",
  email: "אימייל",
} as const;

export const FLIGHT_TIMEZONES = {
  "Asia/Jerusalem": "שעון ישראל",
  "Europe/Athens": "שעון יוון",
} as const;

export function normalizeRequestPhone(value: string): string {
  const cleaned = value.trim().replace(/[\s().-]/g, "");
  if (/^0\d{8,9}$/.test(cleaned)) return `+972${cleaned.slice(1)}`;
  if (/^00[1-9]\d{7,14}$/.test(cleaned)) return `+${cleaned.slice(2)}`;
  return cleaned;
}

function localDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (name: string) =>
    parts.find((entry) => entry.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** Interpret the entered wall-clock time in the selected zone, not the device zone. */
export function flightDateTimeToIso(
  local: string,
  timeZone: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const wallClock = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(wallClock)) return null;
  let candidate = wallClock;
  for (let index = 0; index < 3; index += 1) {
    const displayed = localDateParts(new Date(candidate), timeZone);
    const offset = Date.parse(`${displayed}:00Z`) - candidate;
    candidate = wallClock - offset;
  }
  if (localDateParts(new Date(candidate), timeZone) !== local) return null;
  return new Date(candidate).toISOString();
}

const utmValue = z.string().trim().max(240).default("");

export const leadRequestSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "צריך להזין שם מלא.")
      .max(160, "השם ארוך מדי.")
      .refine(
        (value) => !/[\u0000-\u001f\u007f<>]/.test(value),
        "צריך להזין שם תקין.",
      ),
    phone: z
      .string()
      .trim()
      .max(32)
      .transform(normalizeRequestPhone)
      .refine(
        (value) => /^\+[1-9]\d{7,14}$/.test(value),
        "צריך להזין מספר ישראלי או מספר עם קידומת מדינה, למשל ‎+972501234567.",
      ),
    email: z
      .union([z.literal(""), z.email("כתובת האימייל אינה תקינה.").max(320)])
      .default(""),
    service: z.enum(["medical_concierge", "document_translation", "other"]),
    preferredChannel: z.enum(["whatsapp", "phone", "email"]),
    flightLocal: z.string().max(16).default(""),
    flightTimezone: z
      .enum(["Asia/Jerusalem", "Europe/Athens"])
      .default("Asia/Jerusalem"),
    contactConsent: z.literal(true, {
      error: "צריך לאשר יצירת קשר כדי לשלוח פנייה.",
    }),
    website: z.string().max(200).default(""),
    turnstileToken: z.string().max(2048).default(""),
    utmSource: z.string().trim().max(160).default(""),
    utmMedium: z.string().trim().max(160).default(""),
    utmCampaign: utmValue,
    utmContent: utmValue,
    utmTerm: utmValue,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.preferredChannel === "email" && !value.email) {
      context.addIssue({
        code: "custom",
        path: ["email"],
        message: "צריך להזין אימייל כדי שנוכל לחזור אליך באימייל.",
      });
    }
    if (
      value.flightLocal &&
      !flightDateTimeToIso(value.flightLocal, value.flightTimezone)
    ) {
      context.addIssue({
        code: "custom",
        path: ["flightLocal"],
        message: "מועד הטיסה אינו תקין. כדאי לבדוק את התאריך והשעה.",
      });
    }
  });

export type LeadRequest = z.infer<typeof leadRequestSchema>;
