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
  full_name: 120, passport: 20, age: 3, email: 254, phone: 32,
  city: 60, arrival: 32, condition: 4000, rx_exists: 16, locale: 2, plan: 16,
};

/* Accepted upload types, checked against the file's own leading bytes rather
   than the client-declared MIME. The intake script canvas-converts images to
   JPEG before sending, so a legitimate selfie arrives as JPEG; the rest of
   this list covers a direct or unconverted upload. HEIC matters because it is
   what an iPhone produces. */
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
  // email subject, and a newline in a subject is worth refusing on principle
  // even though Resend is a JSON API rather than SMTP. Over-long values are
  // rejected outright rather than truncated, so nothing is silently altered.
  const str = (name) => {
    const v = form.get(name);
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
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
  if (!/^\d{8}$/.test(passport)) return json(400, { ok: false, error: 'invalid:passport' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: 'invalid:email' });
  // The form says 18+ and the input carries min="18", but that is a client
  // hint. Storing a minor's health record because the check only ever ran in
  // the browser would be the worst version of this bug, so it runs here too.
  const ageNum = Number(age);
  if (!Number.isInteger(ageNum) || ageNum < 18 || ageNum > 120) {
    return json(400, { ok: false, error: 'invalid:age' });
  }
  for (const key of CONSENT_FIELDS) {
    if (!consents[key]) return json(400, { ok: false, error: `missing:${key}` });
  }

  // Bound every free-text field. Without this, `condition` alone can carry a
  // multi-megabyte string into the stored record.
  const lengths = {
    full_name: fullName, passport, age, email, phone,
    city, arrival, condition, rx_exists: rxExists, locale, plan,
  };
  for (const [key, value] of Object.entries(lengths)) {
    if (value && value.length > FIELD_MAX[key]) return json(400, { ok: false, error: `too_long:${key}` });
  }

  const selfie = form.get('file_selfie');
  if (!(selfie instanceof File) || selfie.size === 0) return json(400, { ok: false, error: 'missing:file_selfie' });
  const rxFile = form.get('file_rx');
  const hasRx = rxFile instanceof File && rxFile.size > 0;

  // Size and real type. The declared MIME is ignored: what matters is what the
  // bytes actually are. A selfie must be an image; the prescription may also
  // be a PDF.
  if (selfie.size > MAX_FILE_BYTES) return json(413, { ok: false, error: 'too_large:file_selfie' });
  if (hasRx && rxFile.size > MAX_FILE_BYTES) return json(413, { ok: false, error: 'too_large:file_rx' });

  const selfieKind = await sniff(selfie, false);
  if (!selfieKind) return json(400, { ok: false, error: 'invalid_type:file_selfie' });
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

  let selfieBlob;
  let rxBlob = null;
  try {
    // Fixed names built from the type we detected. The uploaded filename is
    // never used: it is attacker-controlled, and @vercel/blob rejects only the
    // literal sequence "//" in a pathname, so "../" would pass straight through
    // into the storage key.
    selfieBlob = await put(`${base}/selfie.${selfieKind.ext}`, selfie, {
      access: 'private',
      addRandomSuffix: false,
      contentType: selfieKind.mime,
    });
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
    locale, plan, fullName, passport, age, email, phone, city, arrival,
    condition, rxExists, consents,
    selfiePath: selfieBlob.pathname,
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

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { subject, text } = buildEmail(record);
    await resend.emails.send({
      from: 'GreekCloud <onboarding@resend.dev>',
      to: process.env.LEAD_NOTIFY_EMAIL,
      subject,
      text,
    });
  } catch (e) {
    // A failed notification still must not fail the request -- the answers are
    // already durably stored by this point. But console.error alone is close to
    // invisible: nobody reads function logs, and the failure mode this guards
    // against (Resend quota exhausted, domain unverified, key rotated) is
    // exactly the one that goes unnoticed for days. So the failure is written
    // next to the record, where the operator is already looking.
    console.error('resend notify failed for', submissionId, e);
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

  return json(200, { ok: true, submissionId });
}

export default { fetch: handleSubmit };
