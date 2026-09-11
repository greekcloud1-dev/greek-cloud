/* ==========================================================================
   POST /api/submit
   ==========================================================================

   Receives the completed intake form as multipart/form-data. What it does,
   in order:

     1. Reject anything that fails the honeypot or server-side validation --
        the client already validates, but a request can reach here directly.
     2. Store the selfie (required), the existing-prescription file
        (optional), and a JSON record of every field in Vercel Blob, under
        one private, unguessable path per submission. This IS the durable
        copy of the request; nothing here is disposable.
     3. Email a notification through Resend. That email is deliberately thin:
        plan, city, arrival date, name, and a submission id. It never
        contains the health description or the files. The full record lives
        only in Blob, which is why step 2 has to succeed before step 3 is
        attempted -- a notification about a request that was not actually
        saved would be worse than no notification.

   A failed step 3 does not fail the request: the person's answers are
   already safe in Blob by then, and the operator can still find them by
   browsing Storage even if the email never arrives.

   Runs on the Node.js runtime, not Edge: @vercel/blob and resend both reach
   for Node built-ins (node:stream, node:net, node:zlib and friends) that the
   Edge runtime does not provide, and an Edge build fails outright on them.
   The `export default { fetch }` shape is the Web-standard signature Vercel's
   Node runtime supports, so request.formData() and Response still work
   exactly as written.
   ========================================================================== */

import { put } from '@vercel/blob';
import { Resend } from 'resend';
import { crmContactPayload, syncCrmContact } from '../lib/crm-sync.js';

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

const CONSENT_FIELDS = ['c_age', 'c_terms', 'c_customs', 'c_nopromise', 'c_accuracy', 'c_liability'];

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

/* Room for a long, careful description without accepting an unbounded body. */
const MAX_CONDITION = 4000;
const MAX_NAME = 80;
const MAX_PHONE = 25;
const MAX_EMAIL = 254;

/* The form downscales images before upload, so a normal selfie arrives well
   under this. The ceiling is here to bound what a direct caller can store. */
const MAX_SELFIE_BYTES = 6 * 1024 * 1024;
const MAX_RX_BYTES = 10 * 1024 * 1024;

/* A declared content-type is whatever the caller typed. These are the first
   bytes of the formats the form accepts, so the check is on the file itself. */
const IMAGE_SIGNATURES = [
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },  // RIFF....WEBP
  { type: 'image/heic', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
];
const PDF_SIGNATURE = { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] };

function matches(head, sig) {
  const at = sig.offset || 0;
  if (head.length < at + sig.bytes.length) return false;
  return sig.bytes.every((b, i) => head[at + i] === b);
}

/* Returns the format actually found, or null. WEBP needs its second marker:
   'RIFF' alone is also the head of a WAV file. */
async function sniff(file, allowPdf) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (allowPdf && matches(head, PDF_SIGNATURE)) return 'application/pdf';
  for (const sig of IMAGE_SIGNATURES) {
    if (!matches(head, sig)) continue;
    if (sig.type === 'image/webp') {
      const webp = [0x57, 0x45, 0x42, 0x50];
      if (!webp.every((b, i) => head[8 + i] === b)) continue;
    }
    return sig.type;
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

async function handleSubmit(request) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const configured = Boolean(
    process.env.RESEND_API_KEY &&
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
  // whatever filled it does not learn its guess was wrong.
  if (form.get('website')) return json(200, { ok: true });

  const str = (name) => {
    const v = form.get(name);
    return typeof v === 'string' ? v.trim() : '';
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

  const required = { plan, full_name: fullName, passport, age, email, phone, city, condition };
  for (const [key, value] of Object.entries(required)) {
    if (!value) return json(400, { ok: false, error: `missing:${key}` });
  }
  if (plan !== 'standard' && plan !== 'vip') return json(400, { ok: false, error: 'invalid:plan' });
  if (fullName.length > MAX_NAME) return json(400, { ok: false, error: 'invalid:full_name' });
  if (!/^\d{8}$/.test(passport)) return json(400, { ok: false, error: 'invalid:passport' });
  /* The form offers 18-120 and the service is for adults. A string like "25abc"
     or "1e3" must not pass as a number here just because it is non-empty. */
  if (!/^\d{1,3}$/.test(age)) return json(400, { ok: false, error: 'invalid:age' });
  const ageValue = Number(age);
  if (ageValue < 18 || ageValue > 120) return json(400, { ok: false, error: 'invalid:age' });
  if (email.length > MAX_EMAIL) return json(400, { ok: false, error: 'invalid:email' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: 'invalid:email' });
  if (phone.length > MAX_PHONE || !/^[+()\d][\s()\-\d]{5,}$/.test(phone)) {
    return json(400, { ok: false, error: 'invalid:phone' });
  }
  if (!CITIES.has(city)) return json(400, { ok: false, error: 'invalid:city' });
  if (!validArrival(arrival)) return json(400, { ok: false, error: 'invalid:arrival' });
  if (condition.length > MAX_CONDITION) return json(400, { ok: false, error: 'invalid:condition' });
  if (!RX_STATES.has(rxExists)) return json(400, { ok: false, error: 'invalid:rx_exists' });
  for (const key of CONSENT_FIELDS) {
    if (!consents[key]) return json(400, { ok: false, error: `missing:${key}` });
  }

  const selfie = form.get('file_selfie');
  if (!(selfie instanceof File) || selfie.size === 0) return json(400, { ok: false, error: 'missing:file_selfie' });
  if (selfie.size > MAX_SELFIE_BYTES) return json(413, { ok: false, error: 'too_large:file_selfie' });
  /* Sniffed before any storage call: a rejected upload should cost nothing
     and leave nothing behind. */
  const selfieType = await sniff(selfie, false);
  if (!selfieType) return json(400, { ok: false, error: 'invalid:file_selfie' });

  const rxFile = form.get('file_rx');
  const hasRx = rxFile instanceof File && rxFile.size > 0;
  let rxType = null;
  if (hasRx) {
    if (rxFile.size > MAX_RX_BYTES) return json(413, { ok: false, error: 'too_large:file_rx' });
    rxType = await sniff(rxFile, true);
    if (!rxType) return json(400, { ok: false, error: 'invalid:file_rx' });
  }

  const submissionId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
  const base = `submissions/${submissionId}`;

  let selfieBlob;
  let rxBlob = null;
  try {
    selfieBlob = await put(`${base}/selfie-${selfie.name || 'selfie.jpg'}`, selfie, {
      access: 'private',
      addRandomSuffix: false,
      contentType: selfieType,
    });
    if (hasRx) {
      rxBlob = await put(`${base}/rx-${rxFile.name || 'prescription'}`, rxFile, {
        access: 'private',
        addRandomSuffix: false,
        contentType: rxType,
      });
    }
  } catch (e) {
    return json(502, { ok: false, error: 'upload_failed' });
  }

  const record = {
    submissionId,
    receivedAt: new Date().toISOString(),
    locale, plan, fullName, passport, age, email, phone, city, arrival,
    condition, rxExists, consents,
    selfiePath: selfieBlob.pathname,
    rxPath: rxBlob ? rxBlob.pathname : null,
    // This durable intent is saved with the source record before optional sync.
    // A failed bridge must never discard or expose the underlying private intake.
    crmSync: { status: 'pending', version: 1 },
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

  const crmResult = await syncCrmContact(crmContactPayload(record));
  if (crmResult.status !== 'not_configured') {
    try {
      await put(`${base}/crm-delivery.json`, JSON.stringify(crmResult), {
        access: 'private', addRandomSuffix: false, contentType: 'application/json',
      });
    } catch {
      console.error('crm delivery receipt not saved', submissionId);
    }
    if (crmResult.status !== 'synced') console.error('crm sync pending', submissionId, crmResult.status);
  }

  /* Resend reports a refused send as an `error` on the resolved result, not as
     a throw, so awaiting inside a try/catch alone let a rejected address or an
     unverified sender return 200 with nobody told. The visitor's answers are
     already in Blob by now, so neither outcome fails the request -- but the
     outcome is written next to the record, so an operator can find the
     requests whose notification never went out instead of learning about it
     from someone who never heard back. */
  let notify;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { subject, text } = buildEmail(record);
    const result = await resend.emails.send({
      from: 'GreekCloud <onboarding@resend.dev>',
      to: process.env.LEAD_NOTIFY_EMAIL,
      subject,
      text,
    });
    notify = result && result.error
      ? { status: 'failed', reason: result.error.name || 'provider_error' }
      : { status: 'sent', id: result && result.data ? result.data.id : null };
  } catch (e) {
    notify = { status: 'failed', reason: 'delivery_unconfirmed' };
  }

  if (notify.status !== 'sent') {
    console.error('lead notification not delivered', submissionId, notify.reason);
  }
  try {
    await put(`${base}/notify.json`, JSON.stringify(notify), {
      access: 'private', addRandomSuffix: false, contentType: 'application/json',
    });
  } catch (e) {
    console.error('notification receipt not saved', submissionId);
  }

  return json(200, { ok: true, submissionId });
}

export default { fetch: handleSubmit };
