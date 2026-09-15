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

/* A full intake record as api/submit.js builds it. The owner decided the whole
   submission crosses, so the assertions below are about what remains true
   regardless: the files themselves never travel, only their object paths, and
   a value that is not a path inside the intake prefix is dropped. */
const FULL_RECORD = {
  submissionId: 'test-submission-001',
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
  selfiePath: 'submissions/test-submission-001/selfie.jpg',
  rxPath: 'submissions/test-submission-001/prescription.pdf',
};

test('the payload is exactly the agreed field list', () => {
  assert.deepEqual(Object.keys(crmContactPayload(FULL_RECORD)), [
    'submissionId', 'fullName', 'phone', 'email', 'destination',
    'plan', 'arrivalOn', 'locale',
    'passport', 'age', 'condition', 'rxState', 'consents',
    'selfiePath', 'rxPath',
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

test('the object path crosses, and nothing that is not one', () => {
  const payload = crmContactPayload(FULL_RECORD);
  assert.equal(payload.selfiePath, 'submissions/test-submission-001/selfie.jpg');
  assert.equal(payload.rxPath, 'submissions/test-submission-001/prescription.pdf');
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes('http'), 'a path, never a URL');
  assert.ok(!serialized.includes('token'), 'no credential rides along');
});

test('a path that is not inside the intake prefix is dropped', () => {
  for (const bad of [
    '../../etc/passwd',
    'submissions/../secrets/selfie.jpg',
    '/submissions/x/selfie.jpg',
    'https://example.com/selfie.jpg',
    'selfie.jpg',
    'submissions/short/selfie.jpg',
    'submissions/test-submission-001/selfie.jpg\n',
    '',
    null,
    undefined,
  ]) {
    const payload = crmContactPayload({ ...FULL_RECORD, selfiePath: bad });
    assert.equal(payload.selfiePath, null, `${JSON.stringify(bad)} must not cross`);
  }
});

test('a submission with no prescription upload reports none', () => {
  const payload = crmContactPayload({ ...FULL_RECORD, rxPath: null });
  assert.equal(payload.rxPath, null);
  assert.equal(payload.selfiePath, 'submissions/test-submission-001/selfie.jpg');
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
