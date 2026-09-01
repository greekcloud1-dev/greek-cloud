/* ==========================================================================
   POST /api/submit
   ==========================================================================

   Receives the completed intake form as multipart/form-data. What it does,
   in order:

     1. Reject anything that fails the honeypot or server-side validation --
        the client already validates, but a request can reach here directly.
     2. Store the selfie (optional), the existing-prescription file
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

const CONSENT_FIELDS = ['c_age', 'c_terms', 'c_customs', 'c_nopromise', 'c_accuracy', 'c_liability'];

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
  const birthdate = str('birthdate');
  const email = str('email');
  const phone = str('phone');
  const city = str('city');
  const arrival = str('arrival');
  const condition = str('condition');
  const rxExists = str('rx_exists');
  const symptomTags = str('symptom_tags');

  const consents = {};
  for (const key of CONSENT_FIELDS) consents[key] = form.get(key) === 'on';

  const required = { plan, full_name: fullName, passport, birthdate, email, phone, city, condition };
  for (const [key, value] of Object.entries(required)) {
    if (!value) return json(400, { ok: false, error: `missing:${key}` });
  }
  if (plan !== 'standard' && plan !== 'vip') return json(400, { ok: false, error: 'invalid:plan' });
  if (!/^\d{8}$/.test(passport)) return json(400, { ok: false, error: 'invalid:passport' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: 'invalid:email' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return json(400, { ok: false, error: 'invalid:birthdate' });
  const ageYears = Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.2425 * 86400000));
  if (!Number.isFinite(ageYears) || ageYears < 18 || ageYears > 120) {
    return json(400, { ok: false, error: 'invalid:birthdate' });
  }
  for (const key of CONSENT_FIELDS) {
    if (!consents[key]) return json(400, { ok: false, error: `missing:${key}` });
  }

  // The selfie used to be required; it is now optional, so a submission can
  // land without one and be reviewed on the written answers alone.
  const selfie = form.get('file_selfie');
  const hasSelfie = selfie instanceof File && selfie.size > 0;
  const rxFile = form.get('file_rx');
  const hasRx = rxFile instanceof File && rxFile.size > 0;

  const submissionId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
  const base = `submissions/${submissionId}`;

  let selfieBlob = null;
  let rxBlob = null;
  try {
    if (hasSelfie) {
      selfieBlob = await put(`${base}/selfie-${selfie.name || 'selfie.jpg'}`, selfie, {
        access: 'private',
        addRandomSuffix: false,
        contentType: selfie.type || 'image/jpeg',
      });
    }
    if (hasRx) {
      rxBlob = await put(`${base}/rx-${rxFile.name || 'prescription'}`, rxFile, {
        access: 'private',
        addRandomSuffix: false,
        contentType: rxFile.type || 'application/octet-stream',
      });
    }
  } catch (e) {
    return json(502, { ok: false, error: 'upload_failed' });
  }

  const record = {
    submissionId,
    receivedAt: new Date().toISOString(),
    locale, plan, fullName, passport, birthdate, age: ageYears, email, phone, city, arrival,
    condition, symptomTags, rxExists, consents,
    selfiePath: selfieBlob ? selfieBlob.pathname : null,
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
    console.error('resend notify failed for', submissionId, e);
  }

  return json(200, { ok: true, submissionId });
}

export default { fetch: handleSubmit };
