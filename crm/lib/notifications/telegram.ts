import "server-only";

import type {
  DeliveryResult,
  IntegrationReadiness,
  OutboundNotification,
} from "./types";

export function getTelegramReadiness(): IntegrationReadiness {
  const requirements = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  };
  const missing = Object.entries(requirements)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return { configured: missing.length === 0, missing };
}

export async function sendTelegramNotification(
  message: OutboundNotification,
  chatId = process.env.TELEGRAM_CHAT_ID,
): Promise<DeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || !chatId) {
    return {
      ok: false,
      errorCode: "telegram_not_configured",
      errorMessage: "חיבור Telegram עדיין לא הוגדר.",
    };
  }

  const text = [`${message.title}`, message.body]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4096);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          ...(message.actionUrl
            ? {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "פתיחה ב־CRM", url: message.actionUrl }],
                  ],
                },
              }
            : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
      error_code?: number;
      parameters?: { retry_after?: number };
      result?: { message_id?: number };
    } | null;

    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        errorCode: `telegram_${payload?.error_code ?? response.status}`,
        errorMessage: "שליחת הודעת Telegram נכשלה.",
        retryable: response.status === 429 || payload?.error_code === 429,
        retryAfterSeconds: payload?.parameters?.retry_after,
      };
    }

    return {
      ok: true,
      providerMessageId: payload.result?.message_id?.toString(),
    };
  } catch {
    return {
      ok: false,
      errorCode: "telegram_network_error",
      errorMessage: "לא התקבל אישור לשליחה. יש לבדוק לפני ניסיון נוסף.",
      retryable: false,
    };
  }
}
