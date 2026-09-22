/* ==========================================================================
   POST /api/submit
   ==========================================================================

   Receives the completed intake form as multipart/form-data. What it does,
   in order:

     1. Reject anything that fails the honeypot or server-side validation --
        the client already validates, but a request can reach here directly.
     2. Store the existing-prescription file, if one was attached, and a
        JSON record of every field in Vercel Blob, under
        one private, unguessable path per submission. This IS the durable
        copy of the request; nothing here is disposable.
     3. Email a notification through the operator's own Gmail account (an
        app password, never the login password). That email is deliberately
        thin: plan, city, arrival date, name, and a submission id. It never
        contains the health description or the files. The full record lives
        only in Blob, which is why step 2 has to succeed before step 3 is
        attempted -- a notification about a request that was not actually
        saved would be worse than no notification.
     4. The same thin notification to a Telegram chat via the Bot API, if
        TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are configured. Unlike Gmail,
        this channel is optional: its absence does not gate the endpoint (the
        `configured` check below does not include it), so a deployment without
        a bot still serves requests exactly as before this was added.

   A failed step 3 or 4 does not fail the request: the person's answers are
   already safe in Blob by then, and the operator can still find them by
   browsing Storage even if neither notification arrives. The two channels are
   independent -- a failed email does not skip the Telegram attempt or the
   reverse.

   Was Resend, until 2026-09-19: the account never verified a sending domain,
   so every notification went out as the shared onboarding@resend.dev
   address, was accepted by the receiving mail server, and then silently
   discarded with no Spam-folder trace -- Resend reported it as Delivered
   throughout. GMAIL_APP_PASSWORD and LEAD_NOTIFY_EMAIL were already set on
   Vercel from an earlier, unmerged fix for the same problem; this brings the
   code on `main` in line with the credentials already live in production,
   without pulling in that branch's CRM/Supabase bridge, which main does not
   have and does not need to fix this.

   Runs on the Node.js runtime, not Edge: @vercel/blob and nodemailer's SMTP
   transport both reach for Node built-ins (node:stream, node:net, node:tls
   and friends) that the Edge runtime does not provide, and an Edge build
   fails outright on them.
   The `export default { fetch }` shape is the Web-standard signature Vercel's
   Node runtime supports, so request.formData() and Response still work
   exactly as written.
   ========================================================================== */

import { put } from '@vercel/blob';
import nodemailer from 'nodemailer';

/* Cached across invocations on a warm serverless instance -- building a fresh
   SMTP connection pool per request would throw away the point of keep-alive. */
let cachedGmailTransport = null;
function gmailTransport() {
  if (!cachedGmailTransport) {
    cachedGmailTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.LEAD_NOTIFY_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return cachedGmailTransport;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const PLAN_LABEL = {
  he: { standard: 'סטנדרט', vip: 'VIP' },
  en: { standard: 'Standard', vip: 'VIP' },
};

// c_health is explicit consent to process special-category health data and
// transfer it onward. It is separate from c_terms on purpose: bundling it into
// a general terms box is precisely what makes such consent invalid.
const CONSENT_FIELDS = ['c_age', 'c_terms', 'c_health', 'c_customs', 'c_nopromise', 'c_accuracy', 'c_liability'];

/* --- limits -------------------------------------------------------------
   Vercel's serverless request body cap already sits below these, so in
   normal operation the platform rejects an oversized upload before this
   code runs. They are here so the endpoint states its own contract rather
   than inheriting one, and so a future platform change cannot silently
   raise it. Field caps exist because `condition` is free text that goes
   into a stored record, and `city` reaches an email subject.
   --------------------------------------------------------------------- */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FIELD_MAX = {
  full_name: 120, passport: 20, birthdate: 10, email: 254, phone: 32,
  city: 60, arrival: 32, condition: 4000, rx_exists: 16, locale: 2, plan: 16,
};

/* Accepted upload types, checked against the file's own leading bytes rather
   than the client-declared MIME. The intake script canvas-converts images to
   JPEG before sending, so a photographed prescription arrives as JPEG; the
   rest of this list covers a direct or unconverted upload. HEIC matters
   because it is what an iPhone produces. */
const MAGIC = [
  { ext: 'jpg',  mime: 'image/jpeg', test: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: 'png',  mime: 'image/png',  test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { ext: 'webp', mime: 'image/webp', test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  { ext: 'heic', mime: 'image/heic', test: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
  { ext: 'pdf',  mime: 'application/pdf', test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
];

/* The client-supplied filename is never used to build a storage key: it is
   attacker-controlled, and @vercel/blob only rejects the literal sequence
   "//". We keep the extension we detected ourselves and discard the name. */
async function sniff(file, allowPdf) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  for (const m of MAGIC) {
    if (!allowPdf && m.ext === 'pdf') continue;
    if (m.test(head)) return m;
  }
  return null;
}

function buildEmail(record) {
  const isHe = record.locale === 'he';
  const plan = (PLAN_LABEL[isHe ? 'he' : 'en'])[record.plan] || record.plan;

  const subject = isHe
    ? `פנייה חדשה · ${plan} · ${record.city}`
    : `New request · ${plan} · ${record.city}`;

  const lines = isHe ? [
    `מסלול: ${plan}`,
    `עיר: ${record.city}`,
    `תאריך הגעה משוער: ${record.arrival || 'לא צוין'}`,
    `שם: ${record.fullName}`,
    `מזהה פנייה: ${record.submissionId}`,
    '',
    'לא כלול בהודעה זו: תיאור המצב הבריאותי וצילום המרשם אם צורף. הם נשמרים באחסון קבצים פרטי, נפרד מהמייל הזה.',
  ] : [
    `Plan: ${plan}`,
    `City: ${record.city}`,
    `Estimated arrival: ${record.arrival || 'not given'}`,
    `Name: ${record.fullName}`,
    `Submission ID: ${record.submissionId}`,
    '',
    'Not included in this email: the health description and the prescription file if one was attached. They are kept in private file storage, separate from this message.',
  ];

  return { subject, text: lines.join('\n') };
}

/* Bot API over plain fetch -- no SDK, one endpoint, nothing to cache or pool
   the way the Gmail transport is. disable_web_page_preview keeps a bare date
   or id in the text from growing an unwanted preview card. */
async function sendTelegramNotification(subject, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // optional channel; silently a no-op if unset

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `${subject}\n\n${text}`,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`telegram_${res.status}: ${body.slice(0, 200)}`);
  }
}

/* --- best-effort rate limit ---------------------------------------------
   This is a speed bump, not a wall, and it is important to be honest about
   why: serverless instances are ephemeral and scale horizontally, so this
   Map is per-instance. A distributed flood, or simply enough concurrency to
   make Vercel spin up new instances, walks straight past it.

   It is still worth having. It costs nothing, it survives within a warm
   instance for the duration of a burst, and it stops the single most likely
   case -- one script hammering the endpoint from one address.

   The real control is a Vercel WAF / rate-limit rule in front of the
   function, plus a spend limit on the project. Those are dashboard settings,
   not code, and they are listed in the security notes for the operator.
   --------------------------------------------------------------------- */
const RATE_MAX = 5;                       // submissions per window, per address
const RATE_WINDOW_MS = 60 * 60 * 1000;    // one hour
const RATE_MAX_KEYS = 5000;               // bound the Map so it cannot grow unchecked
const seen = new Map();

function clientAddress(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

function rateLimited(request) {
  const key = clientAddress(request);
  if (key === 'unknown') return false;     // never lock out everyone on a header quirk
  const now = Date.now();

  if (seen.size > RATE_MAX_KEYS) {
    for (const [k, hits] of seen) {
      if (!hits.some((t) => now - t < RATE_WINDOW_MS)) seen.delete(k);
      if (seen.size <= RATE_MAX_KEYS) break;
    }
  }

  const recent = (seen.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) { seen.set(key, recent); return true; }
  recent.push(now);
  seen.set(key, recent);
  return false;
}

async function handleSubmit(request) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  if (rateLimited(request)) {
    return new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'retry-after': String(Math.ceil(RATE_WINDOW_MS / 1000)),
      },
    });
  }

  const configured = Boolean(
    process.env.GMAIL_APP_PASSWORD &&
    process.env.BLOB_READ_WRITE_TOKEN &&
    process.env.LEAD_NOTIFY_EMAIL
  );
  if (!configured) return json(503, { ok: false, error: 'not_configured' });

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json(400, { ok: false, error: 'bad_form_data' });
  }

  // Honeypot: a real visitor never fills this in. Answer as if it worked so
  // whatever filled it does not learn its guess was wrong -- which means the
  // response has to be shaped exactly like a real success, submissionId and
  // all. Returning a bare {ok:true} made the two trivially distinguishable and
  // turned the honeypot into an oracle for finding the field name.
  if (form.get('website')) {
    return json(200, {
      ok: true,
      submissionId: `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    });
  }

  // Strip control characters as well as trimming: `city` and `plan` reach an
  // email subject sent over real SMTP, where a newline is a header-injection
  // primitive, not just a cosmetic glitch. Over-long values are rejected
  // outright rather than truncated, so nothing is silently altered.
  const str = (name) => {
    const v = form.get(name);
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  };

  const locale = str('locale') === 'en' ? 'en' : 'he';
  const plan = str('plan');
  const fullName = str('full_name');
  const passport = str('passport');
  const birthdate = str('birthdate');
  const email = str('email');
  const phone = str('phone');
  const city = str('city');
  const arrival = str('arrival');
  const condition = str('condition');
  const rxExists = str('rx_exists');

  const consents = {};
  for (const key of CONSENT_FIELDS) consents[key] = form.get(key) === 'on';

  const required = { plan, full_name: fullName, passport, birthdate, email, phone, city, condition };
  for (const [key, value] of Object.entries(required)) {
    if (!value) return json(400, { ok: false, error: `missing:${key}` });
  }
  if (plan !== 'standard' && plan !== 'vip') return json(400, { ok: false, error: 'invalid:plan' });
  if (!/^\d{8}$/.test(passport)) return json(400, { ok: false, error: 'invalid:passport' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: 'invalid:email' });
  // The form ships a date input with a computed `max`, but that is a client
  // hint. Storing a minor's health record because the check only ever ran in
  // the browser would be the worst version of this bug, so the age is derived
  // from the date here and re-checked.
  //
  // Parsed field by field rather than with `new Date(string)`: that constructor
  // reads a bare YYYY-MM-DD as UTC midnight, which lands on the previous day
  // west of Greenwich and would shift a birthday by one.
  const bdayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate);
  if (!bdayMatch) return json(400, { ok: false, error: 'invalid:birthdate' });
  const [, by, bm, bd] = bdayMatch.map(Number);
  const dob = new Date(by, bm - 1, bd);
  if (dob.getFullYear() !== by || dob.getMonth() !== bm - 1 || dob.getDate() !== bd) {
    return json(400, { ok: false, error: 'invalid:birthdate' });
  }
  const now = new Date();
  let ageNum = now.getFullYear() - by;
  const beforeBirthday = now.getMonth() < bm - 1 || (now.getMonth() === bm - 1 && now.getDate() < bd);
  if (beforeBirthday) ageNum--;
  if (!Number.isInteger(ageNum) || ageNum < 18 || ageNum > 120) {
    return json(400, { ok: false, error: 'invalid:age' });
  }
  for (const key of CONSENT_FIELDS) {
    if (!consents[key]) return json(400, { ok: false, error: `missing:${key}` });
  }

  // Bound every free-text field. Without this, `condition` alone can carry a
  // multi-megabyte string into the stored record.
  const lengths = {
    full_name: fullName, passport, birthdate, email, phone,
    city, arrival, condition, rx_exists: rxExists, locale, plan,
  };
  for (const [key, value] of Object.entries(lengths)) {
    if (value && value.length > FIELD_MAX[key]) return json(400, { ok: false, error: `too_long:${key}` });
  }

  // The prescription is the only upload, and it is optional: a request with no
  // file at all is valid.
  const rxFile = form.get('file_rx');
  const hasRx = rxFile instanceof File && rxFile.size > 0;

  // Size and real type. The declared MIME is ignored: what matters is what the
  // bytes actually are. The prescription may be an image or a PDF.
  if (hasRx && rxFile.size > MAX_FILE_BYTES) return json(413, { ok: false, error: 'too_large:file_rx' });

  let rxKind = null;
  if (hasRx) {
    rxKind = await sniff(rxFile, true);
    if (!rxKind) return json(400, { ok: false, error: 'invalid_type:file_rx' });
  }

  // The unguessable part of the storage path is the only thing separating one
  // person's medical record from another's, so it comes from the CSPRNG rather
  // than Math.random(), whose output is predictable from earlier draws.
  const submissionId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const base = `submissions/${submissionId}`;

  let rxBlob = null;
  try {
    // Fixed names built from the type we detected. The uploaded filename is
    // never used: it is attacker-controlled, and @vercel/blob rejects only the
    // literal sequence "//" in a pathname, so "../" would pass straight through
    // into the storage key.
    if (hasRx) {
      rxBlob = await put(`${base}/prescription.${rxKind.ext}`, rxFile, {
        access: 'private',
        addRandomSuffix: false,
        contentType: rxKind.mime,
      });
    }
  } catch (e) {
    return json(502, { ok: false, error: 'upload_failed' });
  }

  const record = {
    submissionId,
    receivedAt: new Date().toISOString(),
    locale, plan, fullName, passport, birthdate, age: ageNum, email, phone, city, arrival,
    condition, rxExists, consents,
    rxPath: rxBlob ? rxBlob.pathname : null,
  };

  try {
    await put(`${base}/record.json`, JSON.stringify(record, null, 2), {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
    });
  } catch (e) {
    // The files are already saved even if the record write fails, but without
    // it they are hard to find, so this IS fatal -- unlike the email below.
    return json(502, { ok: false, error: 'record_failed' });
  }

  const { subject, text } = buildEmail(record);

  try {
    await gmailTransport().sendMail({
      from: `GreekCloud <${process.env.LEAD_NOTIFY_EMAIL}>`,
      to: process.env.LEAD_NOTIFY_EMAIL,
      subject,
      text,
    });
  } catch (e) {
    // A failed notification still must not fail the request -- the answers are
    // already durably stored by this point. But console.error alone is close to
    // invisible: nobody reads function logs, and the failure mode this guards
    // against (app password revoked, Gmail rate limit) is exactly the one
    // that goes unnoticed for days. So the failure is written next to the
    // record, where the operator is already looking.
    console.error('gmail notify failed for', submissionId, e);
    try {
      await put(`${base}/NOTIFY-FAILED.json`, JSON.stringify({
        submissionId,
        failedAt: new Date().toISOString(),
        reason: e && e.message ? e.message : String(e),
      }, null, 2), {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'application/json',
      });
    } catch (_) { /* nothing further we can do; the record itself is safe */ }
  }

  try {
    await sendTelegramNotification(subject, text);
  } catch (e) {
    // Same reasoning as the Gmail catch above, kept as a separate file rather
    // than merged into NOTIFY-FAILED.json: the two channels fail for unrelated
    // reasons (a revoked bot token says nothing about the Gmail app password),
    // and one record per channel keeps that legible instead of overwriting.
    console.error('telegram notify failed for', submissionId, e);
    try {
      await put(`${base}/TELEGRAM-NOTIFY-FAILED.json`, JSON.stringify({
        submissionId,
        failedAt: new Date().toISOString(),
        reason: e && e.message ? e.message : String(e),
      }, null, 2), {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'application/json',
      });
    } catch (_) { /* nothing further we can do; the record itself is safe */ }
  }

  return json(200, { ok: true, submissionId });
}

export default { fetch: handleSubmit };
