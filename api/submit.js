/* ==========================================================================
   POST /api/submit
   ==========================================================================

   Receives the completed intake form as multipart/form-data. What it does,
   in order:

     1. Reject anything that fails the abuse gate (same-origin, rate limit,
        body size), the honeypot, or server-side validation -- the client
        already validates, but a request can reach here directly.
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

   SECURITY RULES THIS FILE IS BUILT AROUND:
     - Nothing a caller sends ever reaches a storage key. Blob paths are
       built from a server-generated id and an extension derived from the
       file's own magic bytes, so a crafted filename cannot climb out of its
       submission folder or overwrite another one.
     - A file is what its bytes say it is, not what its Content-Type claims.
       HTML, SVG and scripts are rejected outright: these blobs get opened by
       a human operator later, and a stored payload would run in their
       session.
     - Every string is bounded and stripped of control characters before it
       is stored or put in an email. Free text is never trusted to be one
       line or a sane length.

   Runs on the Node.js runtime, not Edge: @vercel/blob and resend both reach
   for Node built-ins (node:stream, node:net, node:zlib and friends) that the
   Edge runtime does not provide, and an Edge build fails outright on them.
   The `export default { fetch }` shape is the Web-standard signature Vercel's
   Node runtime supports, so request.formData() and Response still work
   exactly as written.
   ========================================================================== */

import { put } from '@vercel/blob';
import { Resend } from 'resend';

/* ---------- limits ------------------------------------------------------ */

/* Per-field ceilings. A caller that exceeds one is rejected rather than
   silently truncated: a half-stored passport number or email address is
   worse than an error the visitor can act on. `condition` matches the
   maxlength on the textarea, so the form itself can never trip it. */
const MAX_LEN = {
  full_name: 120,
  passport: 32,
  age: 3,
  email: 254,
  phone: 32,
  city: 64,
  arrival: 10,
  condition: 5000,
  rx_exists: 8,
};

/* Images arrive already downscaled to 1600px JPEG by the browser, so this is
   a backstop for callers that skip the client. Vercel caps the request body
   below this anyway; the check exists so behaviour is defined either way. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 12 * 1024 * 1024;

/* Sliding window, per instance. Serverless means each instance keeps its own
   counters and a distributed flood can still get more than RATE_PER_IP
   through -- this is not a substitute for a WAF. It is enough to stop one
   script from filling Blob storage and the operator's inbox, which is the
   realistic abuse of a form like this one. */
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_PER_IP = 5;
const RATE_GLOBAL = 120;
const hits = new Map();

/* Hosts allowed to POST here. A same-origin form always matches the Host
   header; the literals cover the apex/www pair when a request arrives
   through a different edge hostname. */
const ALLOWED_HOSTS = new Set(['www.greekcloud.co.il', 'greekcloud.co.il']);

/* ---------- helpers ----------------------------------------------------- */

function json(status, body, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...(extraHeaders || {}),
    },
  });
}

/* Strips C0 control characters and DEL from any value on the way in, not
   just on the way into the email: they have no place in a name, a city or a
   health description, and a newline smuggled into one of those is exactly
   what turns a single value into a second email header. Doing it at the door
   means no later consumer of record.json has to think about it. */
function clean(value) {
  let out = '';
  for (const ch of String(value == null ? '' : value)) {
    const code = ch.codePointAt(0);
    out += (code < 0x20 || code === 0x7f) ? ' ' : ch;
  }
  return out.trim();
}

function randomToken(byteLength) {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function clientIp(request) {
  const h = request.headers;
  const direct = h.get('x-vercel-forwarded-for') || h.get('x-real-ip');
  if (direct) return direct.trim();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

/* Records the hit and reports whether it is over the limit. Timestamps
   outside the window are dropped on read and empty buckets are deleted, so
   the map cannot grow without bound on a long-lived instance. */
function overLimit(key, max, now) {
  for (const [k, stamps] of hits) {
    const live = stamps.filter((t) => now - t < RATE_WINDOW_MS);
    if (live.length) hits.set(k, live);
    else hits.delete(k);
  }
  const live = hits.get(key) || [];
  live.push(now);
  hits.set(key, live);
  return live.length > max;
}

/* An absent Origin means a non-browser caller (curl, a bot, a health check).
   Those are covered by the rate limit and the honeypot; blocking them here
   would buy nothing. A *present* Origin that does not match is the actual
   CSRF shape -- a browser posting this form from someone else's page -- and
   that is what gets refused. */
function originAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  let host;
  try {
    host = new URL(origin).host;
  } catch (e) {
    return false;
  }
  if (host === request.headers.get('host')) return true;
  if (ALLOWED_HOSTS.has(host)) return true;
  return /^[a-z0-9-]+\.vercel\.app$/i.test(host);
}

/* ---------- file typing ------------------------------------------------- */

/* The extension a blob is stored under comes from here and nowhere else.
   Deliberately absent: SVG (carries script) and every text format. The
   operator opens these blobs in a browser, so anything that can execute
   there must not be storable in the first place. */
const MAGIC_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

function ascii(bytes, offset, length) {
  let out = '';
  for (let i = offset; i < offset + length && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/* Type detection from the first bytes rather than the declared Content-Type,
   which the caller writes and can therefore lie about. */
function sniffType(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
  if (b.length >= 6 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a')) return 'image/gif';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp' && /^(heic|heix|heim|heis|hevc|hevx|hevm|hevs|mif1|msf1)$/.test(ascii(b, 8, 4))) return 'image/heic';
  if (b.length >= 5 && ascii(b, 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

async function typeOf(file) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return sniffType(head);
}

/* Kept only as metadata inside record.json so the operator can see what the
   visitor called the file. It never touches a path. */
function safeName(name) {
  return clean(name).replace(/[\\/]+/g, '_').slice(0, 120);
}

/* ---------- email ------------------------------------------------------- */

const PLAN_LABEL = {
  he: { standard: 'סטנדרט', vip: 'VIP' },
  en: { standard: 'Standard', vip: 'VIP' },
};

const CONSENT_FIELDS = ['c_age', 'c_terms', 'c_customs', 'c_nopromise', 'c_accuracy', 'c_liability'];

function buildEmail(record) {
  const isHe = record.locale === 'he';
  const plan = (PLAN_LABEL[isHe ? 'he' : 'en'])[record.plan] || record.plan;

  /* Every interpolated value is already control-character free and length
     capped by the validation above, so neither the subject nor the body can
     be made to carry a second header or an unbounded blob of text. */
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

/* ---------- handler ----------------------------------------------------- */

async function handleSubmit(request) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' }, { allow: 'POST' });
  }

  if (!originAllowed(request)) return json(403, { ok: false, error: 'forbidden_origin' });

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) return json(413, { ok: false, error: 'too_large' });

  // Counted before the honeypot and before validation on purpose: a flood of
  // deliberately invalid requests is still a flood. The per-IP check comes
  // first and returns early so a single abusive source cannot spend the
  // shared budget and lock everyone else out.
  const now = Date.now();
  const limited = { ok: false, error: 'rate_limited' };
  if (overLimit(`ip:${clientIp(request)}`, RATE_PER_IP, now)) {
    return json(429, limited, { 'retry-after': '3600' });
  }
  if (overLimit('all', RATE_GLOBAL, now)) {
    return json(429, limited, { 'retry-after': '3600' });
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
  // whatever filled it does not learn its guess was wrong.
  if (form.get('website')) return json(200, { ok: true });

  const str = (name) => {
    const v = form.get(name);
    return typeof v === 'string' ? clean(v) : '';
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

  const lengths = { full_name: fullName, passport, age, email, phone, city, arrival, condition, rx_exists: rxExists };
  for (const [key, value] of Object.entries(lengths)) {
    if (value.length > MAX_LEN[key]) return json(400, { ok: false, error: `too_long:${key}` });
  }

  if (plan !== 'standard' && plan !== 'vip') return json(400, { ok: false, error: 'invalid:plan' });
  if (!/^\d{8}$/.test(passport)) return json(400, { ok: false, error: 'invalid:passport' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: 'invalid:email' });
  // Mirrors the min/max the form itself enforces, so the server cannot end up
  // storing a submission the form would have refused.
  if (!/^\d{1,3}$/.test(age) || Number(age) < 18 || Number(age) > 120) {
    return json(400, { ok: false, error: 'invalid:age' });
  }
  if (!/^[\d+()\s-]{6,32}$/.test(phone)) return json(400, { ok: false, error: 'invalid:phone' });
  if (arrival && !/^\d{4}-\d{2}-\d{2}$/.test(arrival)) return json(400, { ok: false, error: 'invalid:arrival' });
  if (rxExists && rxExists !== 'yes' && rxExists !== 'no') return json(400, { ok: false, error: 'invalid:rx_exists' });
  for (const key of CONSENT_FIELDS) {
    if (!consents[key]) return json(400, { ok: false, error: `missing:${key}` });
  }

  const selfie = form.get('file_selfie');
  if (!(selfie instanceof File) || selfie.size === 0) return json(400, { ok: false, error: 'missing:file_selfie' });
  if (selfie.size > MAX_FILE_BYTES) return json(413, { ok: false, error: 'too_large:file_selfie' });

  const rxFile = form.get('file_rx');
  const hasRx = rxFile instanceof File && rxFile.size > 0;
  if (hasRx && rxFile.size > MAX_FILE_BYTES) return json(413, { ok: false, error: 'too_large:file_rx' });

  // A selfie has to be an image. The prescription may also be a PDF, which is
  // how most people have one.
  const selfieType = await typeOf(selfie);
  if (!selfieType || selfieType === 'application/pdf') {
    return json(415, { ok: false, error: 'invalid:file_selfie' });
  }
  let rxType = null;
  if (hasRx) {
    rxType = await typeOf(rxFile);
    if (!rxType) return json(415, { ok: false, error: 'invalid:file_rx' });
  }

  // 128 bits of CSPRNG entropy. The storage path is the only thing keeping
  // one submission from being reachable by guessing at another's, so it has
  // to be unguessable in fact and not just in appearance.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const submissionId = `${stamp}-${randomToken(16)}`;
  const base = `submissions/${submissionId}`;

  let selfieBlob;
  let rxBlob = null;
  try {
    selfieBlob = await put(`${base}/selfie.${MAGIC_EXT[selfieType]}`, selfie, {
      access: 'private',
      addRandomSuffix: false,
      contentType: selfieType,
    });
    if (hasRx) {
      rxBlob = await put(`${base}/rx.${MAGIC_EXT[rxType]}`, rxFile, {
        access: 'private',
        addRandomSuffix: false,
        contentType: rxType,
      });
    }
  } catch (e) {
    console.error('blob upload failed for', submissionId, e);
    return json(502, { ok: false, error: 'upload_failed' });
  }

  const record = {
    submissionId,
    receivedAt: new Date().toISOString(),
    locale, plan, fullName, passport, age, email, phone, city, arrival,
    condition, rxExists, consents,
    selfiePath: selfieBlob.pathname,
    selfieOriginalName: safeName(selfie.name),
    rxPath: rxBlob ? rxBlob.pathname : null,
    rxOriginalName: hasRx ? safeName(rxFile.name) : null,
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
    console.error('record write failed for', submissionId, e);
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
    console.error('resend notify failed for', submissionId, e);
  }

  return json(200, { ok: true, submissionId });
}

export default { fetch: handleSubmit };
