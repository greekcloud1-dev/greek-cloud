import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const written = new Map();
mock.module('@vercel/blob', {
  namedExports: {
    put: async (pathname, body) => { written.set(pathname, typeof body === 'string' ? body : '[file]'); return { pathname }; },
  },
});
const mails = [];
mock.module('nodemailer', {
  defaultExport: { createTransport: () => ({ sendMail: async (m) => { mails.push(m); } }) },
});

process.env.GMAIL_APP_PASSWORD = 'x';
process.env.BLOB_READ_WRITE_TOKEN = 'x';
process.env.LEAD_NOTIFY_EMAIL = 'ops@example.com';
delete process.env.TELEGRAM_BOT_TOKEN;

const { default: submit } = await import('../api/submit.js');
const { isoDay } = await import('../crm/core.js');

const future = isoDay(Date.now() + 20 * 86400000);
let ip = 0;

function form(over = {}) {
  const f = new FormData();
  const base = {
    locale: 'he', plan: 'vip', full_name: 'דנה כהן', passport: '12345678', birthdate: '1990-03-14',
    email: 'd@example.com', phone: '0501234567', city: 'כרתים', arrival: future, condition: 'כאבים', rx_exists: 'no',
    c_age: 'on', c_terms: 'on', c_health: 'on', c_customs: 'on', c_nopromise: 'on', c_accuracy: 'on', c_liability: 'on',
    ...over,
  };
  for (const [k, v] of Object.entries(base)) if (v !== undefined) f.set(k, v);
  return new Request('https://greek-cloud.com/api/submit', { method: 'POST', body: f, headers: { 'x-forwarded-for': `10.0.0.${++ip}` } });
}

async function send(over) {
  const res = await submit.fetch(form(over));
  return { status: res.status, body: await res.json() };
}

test('flight date is required unless "not sure yet" is ticked', async () => {
  assert.deepEqual((await send({ arrival: undefined })).body, { ok: false, error: 'missing:arrival' });
  assert.equal((await send({ arrival: '2020-01-01' })).body.error, 'invalid:arrival');
  assert.equal((await send({ arrival: '2026-02-30' })).body.error, 'invalid:arrival');
  const ok = await send({ arrival: undefined, arrival_unknown: 'on' });
  assert.equal(ok.status, 200);
  const rec = JSON.parse(written.get(`submissions/${ok.body.submissionId}/record.json`));
  assert.equal(rec.arrivalUnknown, true);
  assert.equal(rec.arrival, '');
});

test('record keeps the source; email links to the CRM card and stays thin', async () => {
  mails.length = 0;
  const r = await send({ utm_source: 'IG', utm_campaign: 'sept<script>', ref_host: 'l.instagram.com' });
  assert.equal(r.status, 200);
  const rec = JSON.parse(written.get(`submissions/${r.body.submissionId}/record.json`));
  assert.equal(rec.source, 'instagram');
  assert.deepEqual(rec.utm, { source: 'ig', medium: '', campaign: 'septscript' });
  assert.equal(rec.refHost, 'l.instagram.com');
  assert.equal(rec.arrival, future);
  const mail = mails[0];
  assert.match(mail.subject, /^ליד חדש · VIP · כרתים · טס \d\d\/\d\d$/);
  assert.match(mail.text, new RegExp(`https://greek-cloud.com/crm/#${r.body.submissionId}`));
  assert.doesNotMatch(mail.text, /כאבים|12345678/);
});

test('a visit with no tags is "direct"', async () => {
  const r = await send({});
  const rec = JSON.parse(written.get(`submissions/${r.body.submissionId}/record.json`));
  assert.equal(rec.source, 'direct');
  assert.equal(rec.utm, undefined);
});

test('over-long source tags are rejected, not truncated', async () => {
  assert.equal((await send({ utm_campaign: 'x'.repeat(101) })).body.error, 'too_long:utm_campaign');
});
