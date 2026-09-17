/* ==========================================================================
   POST /api/submit
   ==========================================================================

   Receives the completed intake form as multipart/form-data. What it does,
   in order:

     1. Reject anything that fails the honeypot or server-side validation --
        the client already validates, but a request can reach here directly.
     2. Upload the selfie (required) and the existing-prescription file
        (optional) to a private Supabase bucket.
     3. File the submission in the CRM through the authenticated bridge. That
        call is what makes the submission real; its result decides the reply.
     4. Through Gmail (the operator's own mailbox, via an app password --
        see GMAIL_APP_PASSWORD below): confirm receipt to the applicant by
        name, and separately notify the operator with a thin summary (plan,
        city, arrival date, name, submission id -- never the health
        description or the files). The same thin summary also goes to
        Telegram if configured.

   Storage is Supabase, singular and deliberately so. An earlier version kept
   the files and a record.json in Vercel Blob while the case lived in the CRM,
   which meant erasing a customer took two jobs in two systems -- and a miss in
   either leaves a face photo behind after somebody asked to be forgotten.

   Blob is still here, but only as a holding area. Nothing is written to it
   when the normal path works. If Supabase or the bridge refuses, the whole
   submission is parked under `unreceived/` with the reason and the visitor is
   told it is pending rather than received. That directory existing at all is
   the alert. See lib/intake-store.js.

   A failed step 4 does not fail the request: the submission is already filed
   in the CRM by then, and the failure is recorded rather than swallowed.

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
import { crmContactPayload, syncCrmContact } from '../lib/crm-sync.js';
import { intakeStorageConfigured, putIntakeFile } from '../lib/intake-store.js';

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

/* The client already checks all of this. None of that reaches here: a request
   can be posted straight to this URL, and before these rules an out-of-range
   age, a value no dropdown offers, or a file that is not an image at all were
   stored and emailed with a 200. Every rule below mirrors one the form shows,
   so a person who fills the form honestly is never rejected by it.

   The city lists are the option text of the two forms verbatim -- the selects
   carry no value attributes, so the label is what gets posted. Adding a
   destination means adding it in three places; that is the cost of not
   accepting arbitrary text into a stored record. */
const CITIES = new Set([
  'אתונה', 'סלוניקי', 'כרתים', 'רודוס', 'קוס', 'סנטוריני', 'מיקונוס', 'קורפו',
  'אחר / עדיין לא ידוע',
  'Athens', 'Thessaloniki', 'Crete', 'Rhodes', 'Kos', 'Santorini', 'Mykonos',
  'Corfu', 'Other / not yet decided',
]);
const RX_STATES = new Set(['no', 'yes', 'past']);

/* Per-field length caps. `condition` is free text that goes into a stored
   record and `city`/`plan` reach an email subject, so each is bounded rather
   than left to grow into a multi-megabyte string. Vercel's serverless body
   cap already sits below MAX_FILE_BYTES in normal operation; these are here
   so the endpoint states its own contract rather than inheriting one. */
const FIELD_MAX = {
  full_name: 80, passport: 20, age: 3, email: 254, phone: 25,
  city: 60, arrival: 32, condition: 4000, rx_exists: 16, locale: 2, plan: 16,
};
const MAX_SELFIE_BYTES = 6 * 1024 * 1024;
const MAX_RX_BYTES = 10 * 1024 * 1024;

/* Accepted upload types, checked against the file's own leading bytes rather
   than the client-declared MIME. The intake script canvas-converts images to
   JPEG before sending, so a legitimate selfie arrives as JPEG; the rest of
   this list covers a direct or unconverted upload. HEIC matters because it
   is what an iPhone produces; WEBP needs its second marker checked too, since
   'RIFF' alone is also the head of a WAV file. */
const MAGIC = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    ext: 'webp', mime: 'image/webp',
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  { ext: 'heic', mime: 'image/heic', test: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
  { ext: 'pdf', mime: 'application/pdf', test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
];

/* Returns { ext, mime } for the format actually found, or null. Sniffed
   before any storage call: a rejected upload should cost nothing and leave
   nothing behind. The client-supplied filename plays no part in the result
   or in the storage key built from it later -- it is attacker-controlled,
   and @vercel/blob only rejects the literal sequence "//" in a pathname, so
   something like "../" would otherwise pass straight through. */
async function sniff(file, allowPdf) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  for (const m of MAGIC) {
    if (!allowPdf && m.ext === 'pdf') continue;
    if (m.test(head)) return m;
  }
  return null;
}

/* An arrival date is optional, but a stored one has to be a real calendar
   day the form could have produced: type="date" posts YYYY-MM-DD. */
function validArrival(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  if (date.toISOString().slice(0, 10) !== value) return false;   // rejects 2026-02-31
  const year = date.getUTCFullYear();
  return year >= 2020 && year <= 2100;
}

/* Root-cause note (2026-09-17): the CRM's own email/Telegram pipeline
   (crm/lib/notifications) lives in the separate greekcloud-crm Vercel
   project, and that project's Production deployment is stuck two commits
   behind -- pushes and a manually created deploy hook both accepted the
   trigger but never produced a new build, for reasons that need the
   account owner's own look at the Vercel dashboard (see CRM-HANDOFF.md).
   Sending the same thin notification directly from here, on a project that
   is known to deploy normally, means a lead is never silently unannounced
   while that is sorted out. This duplicates effort with the CRM pipeline
   once it is live again; that is the point, not a bug -- two independent
   paths to the same phone are better than zero. */
async function sendTelegramNotification(record) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { status: 'skipped', reason: 'telegram_not_configured' };

  const { subject, text } = buildOwnerEmail(record);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `${subject}\n\n${text}` }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      return { status: 'failed', reason: `telegram_${payload?.error_code ?? response.status}` };
    }
    return { status: 'sent', id: payload.result?.message_id ?? null };
  } catch (e) {
    return { status: 'failed', reason: e && e.message ? e.message : 'delivery_unconfirmed' };
  }
}

function buildOwnerEmail(record) {
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
    'לא כלול בהודעה זו: תיאור המצב הבריאותי והתמונות. הם נשמרים באחסון קבצים פרטי, נפרד מהמייל הזה.',
  ] : [
    `Plan: ${plan}`,
    `City: ${record.city}`,
    `Estimated arrival: ${record.arrival || 'not given'}`,
    `Name: ${record.fullName}`,
    `Submission ID: ${record.submissionId}`,
    '',
    'Not included in this email: the health description and photos. They are kept in private file storage, separate from this message.',
  ];

  return { subject, text: lines.join('\n') };
}

/* Sent to the applicant themselves, from the operator's own mailbox -- a
   plain confirmation that their submission arrived, addressed to them by
   name. Deliberately thinner than the owner email: no plan/city/arrival
   summary, since the applicant already knows what they submitted. */
function buildLeadConfirmationEmail(record) {
  const isHe = record.locale === 'he';

  const subject = isHe
    ? 'GreekCloud · הבקשה שלך התקבלה בהצלחה'
    : 'GreekCloud · your request was received';

  const lines = isHe ? [
    `שלום ${record.fullName},`,
    '',
    'הבקשה שלך במערכת GreekCloud התקבלה בהצלחה ונמצאת כעת בטיפול.',
    `מזהה פנייה: ${record.submissionId}`,
    '',
    'ניצור איתך קשר בהמשך עם עדכון.',
    '',
    'GreekCloud',
  ] : [
    `Hi ${record.fullName},`,
    '',
    'Your GreekCloud request was received successfully and is now being processed.',
    `Submission ID: ${record.submissionId}`,
    '',
    'We will follow up with an update soon.',
    '',
    'GreekCloud',
  ];

  return { subject, text: lines.join('\n') };
}

/* Gmail, not a transactional-email provider: the operator asked for the
   confirmation and the lead notice to come from their own mailbox, the one
   they already read, rather than a third-party sending domain. Requires a
   Google Account app password (only issuable once 2-Step Verification is
   on) -- see GMAIL_APP_PASSWORD in the operator's own setup notes; that
   value is a credential like any other and is never printed or committed.
   The transport is cached across invocations on a warm serverless
   instance, since building a fresh SMTP connection pool per request would
   throw away the whole point of keep-alive. */
let cachedGmailTransport = null;
function gmailTransport() {
  if (!cachedGmailTransport) {
    cachedGmailTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.LEAD_NOTIFY_EMAIL,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return cachedGmailTransport;
}

/* Two independent sends, not one email with the operator cc'd: the
   applicant and the operator get different content, and one recipient
   rejecting or bouncing must never take the other down with it. */
async function sendGmailNotifications(record) {
  if (!process.env.GMAIL_APP_PASSWORD) {
    const skipped = { status: 'skipped', reason: 'gmail_not_configured' };
    return { owner: skipped, lead: skipped };
  }

  const transport = gmailTransport();
  const from = `GreekCloud <${process.env.LEAD_NOTIFY_EMAIL}>`;

  let owner;
  try {
    const { subject, text } = buildOwnerEmail(record);
    await transport.sendMail({ from, to: process.env.LEAD_NOTIFY_EMAIL, subject, text });
    owner = { status: 'sent' };
  } catch (e) {
    owner = { status: 'failed', reason: e && e.message ? e.message : 'delivery_unconfirmed' };
  }

  let lead;
  try {
    const { subject, text } = buildLeadConfirmationEmail(record);
    await transport.sendMail({ from, to: record.email, subject, text });
    lead = { status: 'sent' };
  } catch (e) {
    lead = { status: 'failed', reason: e && e.message ? e.message : 'delivery_unconfirmed' };
  }

  return { owner, lead };
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
   not code, and they belong in the operator's security notes.
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
  // email subject sent over real SMTP now, where a newline is a header
  // injection primitive, not just a cosmetic glitch.
  const str = (name) => {
    const v = form.get(name);
    if (typeof v !== 'string') return '';
    return v.replace(/[ -]/g, ' ').trim();
  };

  const locale = str('locale') === 'en' ? 'en' : 'he';
  const plan = str('plan');
  const fullName = str('full_name');
  const passport = str('passport');
  const age = str('age');
  const email = str('email');
  const phone = str('phone');
  const city = str('city');
  const arrival = str('arrival');
  const condition = str('condition');
  const rxExists = str('rx_exists');

  const consents = {};
  for (const key of CONSENT_FIELDS) consents[key] = form.get(key) === 'on';

  // Bound every free-text field before anything else looks at it. Over-long
  // values are rejected outright rather than truncated, so nothing is
  // silently altered.
  const lengths = {
    full_name: fullName, passport, age, email, phone,
    city, arrival, condition, rx_exists: rxExists, locale, plan,
  };
  for (const [key, value] of Object.entries(lengths)) {
    if (value && value.length > FIELD_MAX[key]) return json(400, { ok: false, error: `too_long:${key}` });
  }

  const required = { plan, full_name: fullName, passport, age, email, phone, city, condition };
  for (const [key, value] of Object.entries(required)) {
    if (!value) return json(400, { ok: false, error: `missing:${key}` });
  }
  if (plan !== 'standard' && plan !== 'vip') return json(400, { ok: false, error: 'invalid:plan' });
  if (!/^\d{8}$/.test(passport)) return json(400, { ok: false, error: 'invalid:passport' });
  /* The form offers 18-120 and the input carries min="18", but that is a
     client hint -- storing a minor's health record because the check only
     ever ran in the browser would be the worst version of this bug. A string
     like "25abc" or "1e2" must not pass as a number just because Number()
     parses it into something in range. */
  if (!/^\d{1,3}$/.test(age)) return json(400, { ok: false, error: 'invalid:age' });
  const ageValue = Number(age);
  if (ageValue < 18 || ageValue > 120) return json(400, { ok: false, error: 'invalid:age' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: 'invalid:email' });
  if (!/^[+()\d][\s()\-\d]{5,}$/.test(phone)) return json(400, { ok: false, error: 'invalid:phone' });
  if (!CITIES.has(city)) return json(400, { ok: false, error: 'invalid:city' });
  if (!validArrival(arrival)) return json(400, { ok: false, error: 'invalid:arrival' });
  if (!RX_STATES.has(rxExists)) return json(400, { ok: false, error: 'invalid:rx_exists' });
  for (const key of CONSENT_FIELDS) {
    if (!consents[key]) return json(400, { ok: false, error: `missing:${key}` });
  }

  const selfie = form.get('file_selfie');
  if (!(selfie instanceof File) || selfie.size === 0) return json(400, { ok: false, error: 'missing:file_selfie' });
  if (selfie.size > MAX_SELFIE_BYTES) return json(413, { ok: false, error: 'too_large:file_selfie' });
  const selfieKind = await sniff(selfie, false);
  if (!selfieKind) return json(400, { ok: false, error: 'invalid:file_selfie' });

  const rxFile = form.get('file_rx');
  const hasRx = rxFile instanceof File && rxFile.size > 0;
  let rxKind = null;
  if (hasRx) {
    if (rxFile.size > MAX_RX_BYTES) return json(413, { ok: false, error: 'too_large:file_rx' });
    rxKind = await sniff(rxFile, true);
    if (!rxKind) return json(400, { ok: false, error: 'invalid:file_rx' });
  }

  // The unguessable part of the storage path is the only thing separating one
  // person's medical record from another's, so it comes from the CSPRNG
  // rather than Math.random(), whose output is predictable from earlier draws.
  const submissionId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const base = `submissions/${submissionId}`;

  /* --- store the submission ---------------------------------------------
     Supabase is the store. Blob is the holding area for when it refuses, and
     is otherwise never written to at all -- see lib/intake-store.js for why
     that distinction is the whole point of this design. */
  let selfiePath = null;
  let rxPath = null;
  let storageError = null;
  if (intakeStorageConfigured()) {
    try {
      selfiePath = await putIntakeFile(
        submissionId, `selfie.${selfieKind.ext}`, selfie, selfieKind.mime,
      );
      if (hasRx) {
        rxPath = await putIntakeFile(
          submissionId, `prescription.${rxKind.ext}`, rxFile, rxKind.mime,
        );
      }
    } catch (e) {
      storageError = e && e.message ? e.message : 'storage_unavailable';
    }
  } else {
    storageError = 'storage_not_configured';
  }

  const record = {
    submissionId,
    receivedAt: new Date().toISOString(),
    locale, plan, fullName, passport, age, email, phone, city, arrival,
    condition, rxExists, consents,
    selfiePath,
    rxPath,
  };

  /* The bridge is what actually files the submission, so its result decides
     whether this request succeeded. Unlike before, there is no separate
     durable copy to fall back on by design -- there is a holding area. */
  const crmResult = storageError
    ? { status: 'skipped', code: storageError }
    : await syncCrmContact(crmContactPayload(record));

  if (crmResult.status !== 'synced') {
    /* Park the whole thing where an operator will find it. `unreceived/`
       existing at all is the alert: nothing is written there when the normal
       path works. The files ride along as base64 because there is nowhere
       else left to put them -- this branch means storage refused. */
    const parked = {
      submissionId,
      parkedAt: new Date().toISOString(),
      reason: storageError ?? `bridge_${crmResult.status}:${crmResult.code ?? ''}`,
      record,
    };
    try {
      await put(`unreceived/${submissionId}/record.json`, JSON.stringify(parked, null, 2), {
        access: 'private', addRandomSuffix: false, contentType: 'application/json',
      });
      if (storageError) {
        await put(`unreceived/${submissionId}/selfie.${selfieKind.ext}`, selfie, {
          access: 'private', addRandomSuffix: false, contentType: selfieKind.mime,
        });
        if (hasRx) {
          await put(`unreceived/${submissionId}/prescription.${rxKind.ext}`, rxFile, {
            access: 'private', addRandomSuffix: false, contentType: rxKind.mime,
          });
        }
      }
      console.error('submission parked for recovery', submissionId, parked.reason);
    } catch (e) {
      /* Both stores are refusing. Saying "received" now would be a lie, and
         the visitor can still reach us another way -- which is what the
         maintenance message on the form already tells them. */
      console.error('submission could not be stored anywhere', submissionId, parked.reason);
      return json(503, { ok: false, error: 'not_stored' });
    }
    return json(202, { ok: true, submissionId, pending: true });
  }

  const { owner: ownerMail, lead: leadMail } = await sendGmailNotifications(record);
  const telegramNotify = await sendTelegramNotification(record);

  if (ownerMail.status === 'failed' || leadMail.status === 'failed' || telegramNotify.status === 'failed') {
    /* The case is already in the CRM, so nobody loses the submission over a
       failed email -- which is a real change from when Blob was the only copy
       and the email was the only prompt to go look. It still gets a receipt:
       the failure mode this guards against (app password revoked, Gmail
       rate limit, a bounced applicant address) is silent, and an operator
       should be able to see which requests went unannounced. The receipt
       carries statuses and reasons and no personal data beyond the
       applicant's own address already implied by the case itself. */
    console.error(
      'lead notification not delivered', submissionId,
      'ownerEmail:', ownerMail.status, ownerMail.reason,
      'leadEmail:', leadMail.status, leadMail.reason,
      'telegram:', telegramNotify.status, telegramNotify.reason,
      'case', crmResult.caseId,
    );
    try {
      await put(`notify-failed/${submissionId}.json`, JSON.stringify({
        submissionId, caseId: crmResult.caseId, failedAt: new Date().toISOString(),
        ownerEmail: ownerMail, leadEmail: leadMail, telegram: telegramNotify,
      }), { access: 'private', addRandomSuffix: false, contentType: 'application/json' });
    } catch {
      console.error('notification receipt not saved', submissionId);
    }
  }

  return json(200, { ok: true, submissionId });
}

export default { fetch: handleSubmit };
