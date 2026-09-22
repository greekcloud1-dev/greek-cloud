import nodemailer from 'nodemailer';

/* Email through the operator's Gmail (app password) and Telegram through the Bot
   API. Both are optional per call: an unset channel is skipped, and one failing
   never stops the other. Nothing medical is ever passed in here. */

let transport = null;
function gmail(env) {
  if (!transport) {
    transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: env.LEAD_NOTIFY_EMAIL, pass: env.GMAIL_APP_PASSWORD },
    });
  }
  return transport;
}

export async function sendEmail(env, subject, text) {
  if (!env.LEAD_NOTIFY_EMAIL || !env.GMAIL_APP_PASSWORD) return 'skipped';
  await gmail(env).sendMail({
    from: `GreekCloud <${env.LEAD_NOTIFY_EMAIL}>`,
    to: env.LEAD_NOTIFY_EMAIL,
    subject,
    text,
  });
  return 'sent';
}

export async function sendTelegram(env, text, { buttonUrl, buttonText = 'פתיחה ב-CRM' } = {}, fetchImpl = fetch) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return 'skipped';
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4000),
      disable_web_page_preview: true,
      ...(buttonUrl ? { reply_markup: { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] } } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`telegram_${res.status}: ${body.slice(0, 200)}`);
  }
  return 'sent';
}

/** Both channels, independently. Returns what happened on each. */
export async function notifyAll(env, { subject, text, url }, fetchImpl = fetch) {
  const [email, telegram] = await Promise.allSettled([
    sendEmail(env, subject, url ? `${text}\n\n${url}` : text),
    sendTelegram(env, `${subject}\n\n${text}`, { buttonUrl: url }, fetchImpl),
  ]);
  const out = (r) => (r.status === 'fulfilled' ? r.value : `failed: ${r.reason && r.reason.message}`);
  return { email: out(email), telegram: out(telegram) };
}
