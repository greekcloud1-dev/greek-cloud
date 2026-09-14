import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { crmContactPayload, syncCrmContact } from './crm-sync.js';

const originalFetch = globalThis.fetch;
const previousUrl = process.env.CRM_INGEST_URL;
const previousSecret = process.env.CRM_INGEST_SECRET;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousUrl === undefined) delete process.env.CRM_INGEST_URL; else process.env.CRM_INGEST_URL = previousUrl;
  if (previousSecret === undefined) delete process.env.CRM_INGEST_SECRET; else process.env.CRM_INGEST_SECRET = previousSecret;
});

/* A full intake record as api/submit.js builds it, including the two Blob
   paths. The owner decided the whole submission crosses, so the assertions
   below are about the boundary that remains: file bytes and storage paths stay
   on the website, which serves each file behind a signed, expiring link. */
const FULL_RECORD = {
  submissionId: 'test-001',
  fullName: 'Test',
  phone: '+972500000000',
  email: 'test@example.com',
  city: 'Athens',
  plan: 'vip',
  arrival: '2026-10-01',
  locale: 'en',
  passport: '87654321',
  age: '41',
  condition: 'health narrative',
  rxExists: 'past',
  consents: { c_health: true, c_terms: true },
  selfiePath: 'submissions/test-001/selfie.jpg',
  rxPath: 'submissions/test-001/prescription.pdf',
};

test('the payload is exactly the agreed field list', () => {
  assert.deepEqual(Object.keys(crmContactPayload(FULL_RECORD)), [
    'submissionId', 'fullName', 'phone', 'email', 'destination',
    'plan', 'arrivalOn', 'locale',
    'passport', 'age', 'condition', 'rxState', 'consents',
    'selfieFile', 'rxFile',
  ]);
});

test('the full submission crosses, including the health narrative', () => {
  const payload = crmContactPayload(FULL_RECORD);
  assert.equal(payload.passport, '87654321');
  assert.equal(payload.age, 41, 'age arrives as a number, not the form string');
  assert.equal(payload.condition, 'health narrative');
  assert.equal(payload.rxState, 'past');
  assert.deepEqual(payload.consents, { c_health: true, c_terms: true });
});

test('no storage path or URL crosses -- only the basename', () => {
  const payload = crmContactPayload(FULL_RECORD);
  assert.equal(payload.selfieFile, 'selfie.jpg');
  assert.equal(payload.rxFile, 'prescription.pdf');
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes('submissions/'), 'no storage prefix');
  assert.ok(!serialized.includes('http'), 'no URL of any kind');
  assert.ok(!serialized.includes('selfiePath'), 'the path field itself never crosses');
  assert.ok(!serialized.includes('rxPath'));
});

test('traversal segments are discarded, not carried across', () => {
  // Taking the basename IS the defence: whatever directory games appear in the
  // input, only the final name survives, and the website rebuilds the path
  // from the submission id it already trusts.
  for (const [input, expected] of [
    ['../selfie.jpg', 'selfie.jpg'],
    ['submissions/x/../../selfie.png', 'selfie.png'],
    ['/etc/passwd/selfie.jpg', 'selfie.jpg'],
  ]) {
    const payload = crmContactPayload({ ...FULL_RECORD, selfiePath: input });
    assert.equal(payload.selfieFile, expected, input);
    assert.ok(!payload.selfieFile.includes('/'), 'never a path');
    assert.ok(!payload.selfieFile.includes('..'), 'never a traversal');
  }
});

test('anything that is not a plain basename is dropped', () => {
  for (const bad of [
    'submissions/x/../../etc/passwd',   // no extension once reduced
    'selfie',                           // no extension
    'selfie.jpeg.exe.verylong',         // not the shape api/submit.js writes
    'SELFIE.JPG',                       // upper case is not what we produce
    '',
    null,
    undefined,
  ]) {
    const payload = crmContactPayload({ ...FULL_RECORD, selfiePath: bad });
    assert.equal(payload.selfieFile, null, `${JSON.stringify(bad)} must not cross`);
  }
});

test('a submission with no prescription upload reports none', () => {
  const payload = crmContactPayload({ ...FULL_RECORD, rxPath: null });
  assert.equal(payload.rxFile, null);
  assert.equal(payload.selfieFile, 'selfie.jpg', 'the selfie is unaffected');
});

test('an omitted arrival date is null rather than an empty string', () => {
  // The receiving column is a date; '' is not one, and the schema rejects it.
  assert.equal(crmContactPayload({ ...FULL_RECORD, arrival: '' }).arrivalOn, null);
});

test('unconfigured bridge does not call the network', async () => {
  delete process.env.CRM_INGEST_URL;
  globalThis.fetch = () => { throw new Error('unexpected network call'); };
  assert.equal((await syncCrmContact({})).status, 'not_configured');
});
test('bridge refuses insecure configured URLs', async () => {
  process.env.CRM_INGEST_URL='http://example.com/intake'; process.env.CRM_INGEST_SECRET='x'.repeat(32);
  assert.equal((await syncCrmContact({})).status, 'configuration_error');
});
test('provider rejection leaves the saved submission pending', async () => {
  process.env.CRM_INGEST_URL='https://example.com/intake'; process.env.CRM_INGEST_SECRET='x'.repeat(32);
  globalThis.fetch=async () => new Response('{}',{status:503});
  assert.deepEqual(await syncCrmContact({}),{status:'pending',code:'http_503'});
});
test('successful bridge requires a confirmed case identifier', async () => {
  process.env.CRM_INGEST_URL='https://example.com/intake'; process.env.CRM_INGEST_SECRET='x'.repeat(32);
  globalThis.fetch=async () => Response.json({ok:true,caseId:'test-case'});
  assert.deepEqual(await syncCrmContact({}),{status:'synced',caseId:'test-case'});
});
