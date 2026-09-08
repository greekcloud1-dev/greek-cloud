import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailReadiness, sendEmailNotification } from "./email";
import { getTelegramReadiness, sendTelegramNotification } from "./telegram";
import type { OutboundNotification } from "./types";

interface ClaimedDelivery {
  delivery_id: string;
  claim_token: string;
  channel: "email" | "telegram";
  attempts: number;
  recipient_email: string;
  telegram_chat_id: string | null;
  reference_no: string | null;
  case_id: string | null;
}

function getSiteOrigin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Provider payloads deliberately ignore notification/body and free text. */
function externalMessage(
  delivery: ClaimedDelivery,
  origin: string,
): OutboundNotification {
  const reference = delivery.reference_no?.match(/^GC-[A-Z0-9-]{1,40}$/)
    ? delivery.reference_no
    : delivery.case_id?.slice(0, 8);
  const url = new URL("/crm/", origin);
  if (delivery.case_id) url.searchParams.set("case", delivery.case_id);
  return {
    title: "עדכון ב־GreekCloud",
    body: reference
      ? `יש עדכון בתיק ${reference}. הפרטים זמינים במערכת.`
      : "יש עדכון חדש במערכת.",
    actionUrl: url.toString(),
    idempotencyKey: `crm-notification/${delivery.delivery_id}`,
  };
}

export async function dispatchCrmNotifications() {
  const admin = createAdminClient();
  const email = getEmailReadiness();
  const telegram = getTelegramReadiness();
  const origin = getSiteOrigin();
  const missingConfiguration = [
    ...email.missing,
    ...telegram.missing,
    ...(origin ? [] : ["NEXT_PUBLIC_SITE_URL_HTTPS"]),
  ];
  const prepared = await admin.rpc("crm_prepare_notifications", {
    p_limit: 100,
  });
  if (prepared.error) throw new Error("notification_preparation_failed");

  // Ten messages with bounded parallelism finish well within the 60-second route.
  const claimed = await admin.rpc("crm_claim_notification_deliveries", {
    p_email_ready: email.configured && Boolean(origin),
    p_telegram_ready: telegram.configured && Boolean(origin),
    p_telegram_fallback: Boolean(process.env.TELEGRAM_CHAT_ID),
    p_limit: 10,
  });
  if (claimed.error) throw new Error("notification_claim_failed");
  const deliveries = (claimed.data ?? []) as ClaimedDelivery[];
  const counts = {
    claimed: deliveries.length,
    sent: 0,
    retryScheduled: 0,
    needsReview: 0,
    unconfirmed: 0,
  };

  for (let offset = 0; offset < deliveries.length; offset += 5) {
    await Promise.all(
      deliveries.slice(offset, offset + 5).map(async (delivery) => {
        const message = externalMessage(delivery, origin!);
        const result =
          delivery.channel === "email"
            ? await sendEmailNotification(message, delivery.recipient_email)
            : await sendTelegramNotification(
                message,
                delivery.telegram_chat_id || process.env.TELEGRAM_CHAT_ID,
              );
        const retryable = Boolean(result.retryable && delivery.attempts < 5);
        const finished = await admin.rpc("crm_finish_notification_delivery", {
          p_delivery_id: delivery.delivery_id,
          p_claim_token: delivery.claim_token,
          p_ok: result.ok,
          p_provider_message_id: result.providerMessageId ?? null,
          p_error_code: result.errorCode ?? null,
          p_retryable: retryable,
          p_retry_after_seconds: Number.isFinite(result.retryAfterSeconds)
            ? Math.max(0, Math.min(21600, Math.ceil(result.retryAfterSeconds!)))
            : null,
        });
        // A provider acknowledgment is not enough: recording it must also succeed.
        if (finished.error || finished.data !== true) counts.unconfirmed += 1;
        else if (result.ok) counts.sent += 1;
        else if (retryable) counts.retryScheduled += 1;
        else counts.needsReview += 1;
      }),
    );
  }

  const [pending, skipped, needsReview] = await Promise.all([
    admin
      .from("crm_notification_deliveries")
      .select("id", { count: "exact", head: true })
      .in("channel", ["email", "telegram"])
      .or("status.eq.queued,and(status.eq.failed,next_attempt_at.not.is.null)"),
    admin
      .from("crm_notification_deliveries")
      .select("id", { count: "exact", head: true })
      .in("channel", ["email", "telegram"])
      .eq("status", "skipped"),
    admin
      .from("crm_notification_deliveries")
      .select("id", { count: "exact", head: true })
      .in("channel", ["email", "telegram"])
      .eq("status", "failed")
      .is("next_attempt_at", null),
  ]);
  return {
    // An older unresolved delivery or unreadable queue still needs attention
    // even if this particular run claimed no messages.
    ok:
      counts.unconfirmed === 0 &&
      counts.needsReview === 0 &&
      !pending.error &&
      !skipped.error &&
      !needsReview.error &&
      needsReview.count === 0,
    prepared: prepared.data,
    run: counts,
    queue: {
      pending: pending.error ? null : pending.count,
      skipped: skipped.error ? null : skipped.count,
      needsReview: needsReview.error ? null : needsReview.count,
    },
    integrations: {
      email: email.configured && Boolean(origin),
      telegram: telegram.configured && Boolean(origin),
      telegramDefaultRecipientConfigured: Boolean(process.env.TELEGRAM_CHAT_ID),
      missingConfiguration,
    },
  };
}
