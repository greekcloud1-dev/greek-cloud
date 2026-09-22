/* The form/server contract.

   Both intake pages are parsed from the shipped HTML, a submission is built
   from exactly the fields each page really has, and it is sent through the
   real /api/submit handler. If a page is missing a field the server requires
   -- as en/intake.html was with the c_health consent, which rejected every
   English submission -- this fails, instead of a customer finding out. */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const written = new Map();
mock.module('@vercel/blob', {
  namedExports: {
    put: async (pathname, body) => { written.set(pathname, typeof body === 'string' ? body : '[file]'); return { pathname }; },
  },
});
mock.module('nodemailer', {
  defaultExport: { createTransport: () => ({ sendMail: async () => {} }) },
});

process.env.GMAIL_APP_PASSWORD = 'x';
process.env.BLOB_READ_WRITE_TOKEN = 'x';
process.env.LEAD_NOTIFY_EMAIL = 'ops@example.com';
delete process.env.TELEGRAM_BOT_TOKEN;

const { default: submit } = await import('../api/submit.js');
const { isoDay } = await import('../crm/core.js');

const future = isoDay(Date.now() + 30 * 86400000);
let ip = 100;

/* Every named control on the page, with the first option value for radios and
   selects, as a visitor filling it in would produce. */
function fieldsOf(file) {
  const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));
  const out = {};
  for (const m of form.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = m[2];
    const name = (attrs.match(/\bname="([^"]+)"/) || [])[1];
    if (!name || name === 'website') continue;
    const type = (attrs.match(/\btype="([^"]+)"/) || [])[1] || (m[1] === 'input' ? 'text' : m[1]);
    const value = (attrs.match(/\bvalue="([^"]*)"/) || [])[1];
    if (name in out) continue;
    out[name] = { type, value, tag: m[1] };
  }
  return out;
}

const SAMPLE = {
  full_name: 'ISRAEL ISRAELI', passport: '12345678', birthdate: '1990-03-14',
  email: 'visitor@example.com', phone: '0501234567', condition: 'Chronic pain, physiotherapy helped partly.',
};

function realisticSubmission(fields) {
  const f = new FormData();
  for (const [name, { type, value, tag }] of Object.entries(fields)) {
    if (type === 'file') continue;
    if (name === 'arrival_unknown') continue;             // leave it unticked: the stricter path
    if (type === 'checkbox') { f.set(name, 'on'); continue; }
    if (type === 'radio') { f.set(name, value); continue; }
    if (tag === 'select') { f.set(name, 'Athens'); continue; }
    if (name === 'arrival') { f.set(name, future); continue; }
    if (type === 'hidden') { if (value) f.set(name, value); continue; }
    f.set(name, SAMPLE[name] ?? 'x');
  }
  return f;
}

for (const page of ['intake.html', 'en/intake.html']) {
  test(`${page}: a visitor who fills every field on the page is accepted`, async () => {
    const fields = fieldsOf(page);
    const res = await submit.fetch(new Request('https://greek-cloud.com/api/submit', {
      method: 'POST', body: realisticSubmission(fields), headers: { 'x-forwarded-for': `10.9.0.${++ip}` },
    }));
    const body = await res.json();
    assert.equal(res.status, 200, `${page} rejected: ${JSON.stringify(body)}`);
    assert.equal(body.ok, true);
  });
}

test('both language versions carry the same field names', () => {
  const he = Object.keys(fieldsOf('intake.html')).sort();
  const en = Object.keys(fieldsOf('en/intake.html')).sort();
  assert.deepEqual(en, he);
});

test('the passport field enforces the server format on both pages', () => {
  for (const page of ['intake.html', 'en/intake.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const tag = html.match(/<input id="passport"[^>]*>/s)[0];
    assert.match(tag, /inputmode="numeric"/, `${page}: passport not numeric`);
    assert.match(tag, /maxlength="8"/, `${page}: passport has no 8-digit limit`);
  }
});
