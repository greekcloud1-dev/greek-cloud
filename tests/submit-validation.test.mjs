/* QA-02, QA-03, QA-04 — /api/submit trusted the form.
     - an age, city or prescription state the form never offers was stored;
     - a file that is not an image at all was stored as a selfie;
     - a send Resend refused by returning an error, rather than throwing,
       was reported as success and recorded nowhere.

   The handler is loaded with @vercel/blob and resend stubbed, so every case
   below is asserted on what the handler would actually have stored or sent. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

/* Two collaborators reach the network. A tiny loader hook swaps them for
   recorders, so nothing here leaves the process. */
const calls = { puts: [], sends: [] };
let sendResult = { data: { id: 'email_test' }, error: null };
let sendThrows = false;

register(
  'data:text/javascript,' + encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      if (spec === '@vercel/blob') return { url: 'stub:blob', shortCircuit: true, format: 'module' };
      if (spec === 'resend') return { url: 'stub:resend', shortCircuit: true, format: 'module' };
      return next(spec, ctx);
    }
    export async function load(url, ctx, next) {
      if (url === 'stub:blob') return {
        format: 'module', shortCircuit: true,
        source: "export const put = (...a) => globalThis.__stub.put(...a);",
      };
      if (url === 'stub:resend') return {
        format: 'module', shortCircuit: true,
        source: "export class Resend { constructor() { this.emails = { send: (...a) => globalThis.__stub.send(...a) }; } }",
      };
      return next(url, ctx);
    }
  `),
  pathToFileURL('./'),
);

globalThis.__stub = {
  put: async (path, body, opts) => {
    calls.puts.push({ path, body, opts });
    return { pathname: path };
  },
  send: async (msg) => {
    calls.sends.push(msg);
    if (sendThrows) throw new Error('network');
    return sendResult;
  },
};

process.env.RESEND_API_KEY = 'test';
process.env.BLOB_READ_WRITE_TOKEN = 'test';
process.env.LEAD_NOTIFY_EMAIL = 'ops@example.test';

const handler = (await import('../api/submit.js')).default;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0, 0, 0, 0, 0]);
const NOT_AN_IMAGE = new TextEncoder().encode('#!/bin/sh\necho not an image\n');
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0, 0, 0, 0, 0]);

const VALID = {
  locale: 'he', plan: 'standard', full_name: 'TEST VISITOR', passport: '12345678',
  age: '41', email: 'test@example.test', phone: '+972-50-0000000', city: 'אתונה',
  arrival: '2026-09-16', condition: 'test condition text', rx_exists: 'no',
  c_age: 'on', c_terms: 'on', c_customs: 'on', c_nopromise: 'on',
  c_accuracy: 'on', c_liability: 'on',
};

function post(overrides = {}, files = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries({ ...VALID, ...overrides })) {
    if (v !== undefined) form.append(k, v);
  }
  const selfie = files.selfie === undefined
    ? new File([JPEG], 'selfie.jpg', { type: 'image/jpeg' })
    : files.selfie;
  if (selfie) form.append('file_selfie', selfie);
  if (files.rx) form.append('file_rx', files.rx);
  return handler.fetch(new Request('https://example.test/api/submit', { method: 'POST', body: form }));
}

beforeEach(() => {
  calls.puts.length = 0;
  calls.sends.length = 0;
  sendResult = { data: { id: 'email_test' }, error: null };
  sendThrows = false;
});

test('a well-formed request is still accepted and stored', async () => {
  const res = await post();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.submissionId);
  assert.ok(calls.puts.some((p) => p.path.endsWith('/record.json')));
  assert.equal(calls.sends.length, 1);
});

/* QA-02 — every rule the form shows is now enforced behind it. */
for (const [label, overrides] of [
  ['an age below the stated minimum', { age: '16' }],
  ['an implausible age', { age: '250' }],
  ['an age that is not a number', { age: '25abc' }],
  ['an age in exponent form', { age: '1e3' }],
  ['a city no dropdown offers', { city: 'Reykjavik' }],
  ['a prescription state no control offers', { rx_exists: 'maybe' }],
  ['a calendar day that does not exist', { arrival: '2026-02-31' }],
  ['an arrival date in the wrong format', { arrival: '16/09/2026' }],
  ['a plan that was never offered', { plan: 'platinum' }],
  ['a phone number that is not one', { phone: 'call me' }],
]) {
  test(`rejects ${label} before anything is stored`, async () => {
    const res = await post(overrides);
    assert.equal(res.status, 400);
    assert.equal(calls.puts.length, 0, 'nothing was written');
    assert.equal(calls.sends.length, 0, 'nobody was emailed');
  });
}

test('rejects a selfie that is not an image, whatever it claims to be', async () => {
  const res = await post({}, {
    selfie: new File([NOT_AN_IMAGE], 'selfie.jpg', { type: 'image/jpeg' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid:file_selfie');
  assert.equal(calls.puts.length, 0, 'a rejected upload costs no storage');
});

test('rejects a prescription file that is neither image nor PDF', async () => {
  const res = await post({}, { rx: new File([NOT_AN_IMAGE], 'rx.pdf', { type: 'application/pdf' }) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid:file_rx');
  assert.equal(calls.puts.length, 0);
});

test('accepts a real PDF prescription and stores its true type', async () => {
  const res = await post({}, { rx: new File([PDF], 'rx.pdf', { type: 'application/octet-stream' }) });
  assert.equal(res.status, 200);
  const rx = calls.puts.find((p) => p.path.includes('/rx-'));
  assert.ok(rx);
  assert.equal(rx.opts.contentType, 'application/pdf', 'the sniffed type wins over the claim');
});

test('stores the selfie under its sniffed type, not the declared one', async () => {
  await post({}, { selfie: new File([JPEG], 'selfie.png', { type: 'image/png' }) });
  const selfie = calls.puts.find((p) => p.path.includes('/selfie-'));
  assert.equal(selfie.opts.contentType, 'image/jpeg');
});

test('rejects an oversized selfie with 413 and stores nothing', async () => {
  const big = new Uint8Array(7 * 1024 * 1024);
  big.set(JPEG);
  const res = await post({}, { selfie: new File([big], 'selfie.jpg', { type: 'image/jpeg' }) });
  assert.equal(res.status, 413);
  assert.equal(calls.puts.length, 0);
});

/* QA-03 — the English form asked for a passport "as printed"; the server has
   always required eight digits. The forms now say the same thing. */
test('an alphanumeric passport is refused in both locales', async () => {
  for (const locale of ['he', 'en']) {
    const res = await post({ locale, passport: 'AB1234567' });
    assert.equal(res.status, 400, locale);
    assert.equal((await res.json()).error, 'invalid:passport', locale);
  }
});

/* QA-04 — a refused send arrives as a value, not a throw. */
test('an error returned by the mail provider is recorded, not swallowed', async () => {
  sendResult = { data: null, error: { name: 'validation_error', message: 'from unverified' } };
  const res = await post();

  assert.equal(res.status, 200, 'the request itself still succeeds: the record is safe');
  const receipt = calls.puts.find((p) => p.path.endsWith('/notify.json'));
  assert.ok(receipt, 'the outcome is written next to the record');
  const notify = JSON.parse(receipt.body);
  assert.equal(notify.status, 'failed');
  assert.equal(notify.reason, 'validation_error');
});

test('a thrown send is recorded as failed too', async () => {
  sendThrows = true;
  await post();
  const notify = JSON.parse(calls.puts.find((p) => p.path.endsWith('/notify.json')).body);
  assert.equal(notify.status, 'failed');
  assert.equal(notify.reason, 'delivery_unconfirmed');
});

test('a delivered send is recorded as sent', async () => {
  await post();
  const notify = JSON.parse(calls.puts.find((p) => p.path.endsWith('/notify.json')).body);
  assert.equal(notify.status, 'sent');
  assert.equal(notify.id, 'email_test');
});
