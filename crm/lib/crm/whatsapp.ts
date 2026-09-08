export const WHATSAPP_TEMPLATE_KEYS = [
  "first_contact",
  "details_reminder",
  "follow_up",
  "flight_approaching",
  "completion",
] as const;

export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATE_KEYS)[number];

export interface WhatsAppTemplateContext {
  firstName?: string;
  caseReference?: string;
  flightCountdown?: string;
}

export interface WhatsAppTemplateDefinition {
  key: WhatsAppTemplateKey;
  name: string;
  body: string;
}

export const WHATSAPP_TEMPLATES: Readonly<
  Record<WhatsAppTemplateKey, WhatsAppTemplateDefinition>
> = {
  first_contact: {
    key: "first_contact",
    name: "יצירת קשר ראשונית",
    body: "שלום {{firstName}}, כאן צוות GreekCloud. קיבלנו את פנייתך ונשמח להמשיך מכאן. מתי נוח לדבר?",
  },
  details_reminder: {
    key: "details_reminder",
    name: "תזכורת לפרטים תפעוליים",
    body: "שלום {{firstName}}, כדי שנוכל להמשיך בטיפול בפנייה {{caseReference}}, נשמח לקבל את הפרטים התפעוליים החסרים שסיכמנו. תודה.",
  },
  follow_up: {
    key: "follow_up",
    name: "מעקב כללי",
    body: "שלום {{firstName}}, רק תזכורת ידידותית לגבי הפנייה {{caseReference}}. נשמח לדעת אם אפשר להמשיך בטיפול.",
  },
  flight_approaching: {
    key: "flight_approaching",
    name: "מועד טיסה מתקרב",
    body: "שלום {{firstName}}, מועד הטיסה שסיפקת מתקרב{{flightCountdown}}. נשמח לוודא שכל הפרטים התפעוליים מתואמים.",
  },
  completion: {
    key: "completion",
    name: "סיום טיפול",
    body: "שלום {{firstName}}, הטיפול התפעולי בפנייה {{caseReference}} הושלם. אנחנו זמינים לכל שאלה נוספת.",
  },
};

const TOKEN_PATTERN = /{{(firstName|caseReference|flightCountdown)}}/g;

function cleanTemplateValue(value: string | undefined): string {
  return (value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

export function renderWhatsAppTemplate(
  key: WhatsAppTemplateKey,
  context: WhatsAppTemplateContext,
): string {
  const cleanCountdown = cleanTemplateValue(context.flightCountdown);
  const values: Record<keyof WhatsAppTemplateContext, string> = {
    firstName: cleanTemplateValue(context.firstName),
    caseReference: cleanTemplateValue(context.caseReference),
    flightCountdown: cleanCountdown ? ` — ${cleanCountdown}` : "",
  };

  return WHATSAPP_TEMPLATES[key].body
    .replace(
      TOKEN_PATTERN,
      (_token, name: keyof WhatsAppTemplateContext) => values[name],
    )
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function toWhatsAppDigits(phoneE164: string): string {
  const trimmed = phoneE164.trim();
  const digits = trimmed.replace(/[^0-9]/g, "");

  if (!trimmed.startsWith("+") || digits.length < 8 || digits.length > 15) {
    throw new Error(
      "WhatsApp phone number must use E.164 format, for example +972501234567.",
    );
  }

  if (digits.startsWith("0")) {
    throw new Error(
      "WhatsApp phone number cannot start with zero after normalization.",
    );
  }

  return digits;
}

export function buildWhatsAppUrl(phoneE164: string, message?: string): string {
  const digits = toWhatsAppDigits(phoneE164);
  const cleanMessage = cleanTemplateValue(message);
  const query = cleanMessage ? `?text=${encodeURIComponent(cleanMessage)}` : "";

  return `https://wa.me/${digits}${query}`;
}

export function buildTemplatedWhatsAppUrl(
  phoneE164: string,
  key: WhatsAppTemplateKey,
  context: WhatsAppTemplateContext,
): string {
  return buildWhatsAppUrl(phoneE164, renderWhatsAppTemplate(key, context));
}
