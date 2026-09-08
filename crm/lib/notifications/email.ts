import "server-only";

import type {
  DeliveryResult,
  IntegrationReadiness,
  OutboundNotification,
} from "./types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function getEmailReadiness(): IntegrationReadiness {
  const requirements = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NOTIFICATION_FROM_EMAIL: process.env.NOTIFICATION_FROM_EMAIL,
  };
  const missing = Object.entries(requirements)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return { configured: missing.length === 0, missing };
}

export async function sendEmailNotification(
  message: OutboundNotification,
  recipient = process.env.NOTIFICATION_TO_EMAIL,
): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;

  if (!apiKey || !from || !recipient) {
    return {
      ok: false,
      errorCode: "email_not_configured",
      errorMessage: "חיבור האימייל עדיין לא הוגדר.",
    };
  }

  const text = [message.body, message.actionUrl].filter(Boolean).join("\n\n");

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey.slice(0, 256),
        "User-Agent": "GreekCloud-CRM/1.0",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: message.title,
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
    } | null;

    if (!response.ok) {
      return {
        ok: false,
        errorCode: `resend_${response.status}`,
        errorMessage: "שליחת האימייל נכשלה.",
        retryable: response.status === 429 || response.status >= 500,
      };
    }

    return { ok: true, providerMessageId: payload?.id };
  } catch {
    return {
      ok: false,
      errorCode: "resend_network_error",
      errorMessage: "לא התקבל אישור לשליחת האימייל.",
      retryable: true,
    };
  }
}
