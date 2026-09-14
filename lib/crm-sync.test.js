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

/* A full intake record, including every field that must never reach the CRM.
   Each forbidden value is the same marker string, so one assertion over the
   serialized payload catches any of them crossing. */
const FULL_RECORD = {
  submissionId: 'test-001',
  fullName: 'Test',
  phone: '+972500000000',
  email: 'test@example.com',
  city: 'Athens',
  plan: 'vip',
  arrival: '2026-10-01',
  locale: 'en',
  passport: 'never-send',
  age: 'never-send',
  condition: 'never-send',
  rxExists: 'never-send',
  selfiePath: 'never-send',
  rxPath: 'never-send',
  consents: { c_health: 'never-send' },
};

test('bridge sends only the operational field allowlist', () => {
  const payload = crmContactPayload(FULL_RECORD);
  assert.deepEqual(Object.keys(payload), [
    'submissionId', 'fullName', 'phone', 'email', 'destination',
    'plan', 'arrivalOn', 'locale',
  ]);
});

test('no medical, identifying or file field crosses the bridge', () => {
  const serialized = JSON.stringify(crmContactPayload(FULL_RECORD));
  assert.ok(!serialized.includes('never-send'), serialized);
  for (const forbidden of ['passport', 'age', 'condition', 'rxExists', 'selfiePath', 'rxPath', 'consents']) {
    assert.ok(!serialized.includes(forbidden), `${forbidden} must not cross`);
  }
});

test('the operational fields carry their submitted values', () => {
  const payload = crmContactPayload(FULL_RECORD);
  assert.equal(payload.destination, 'Athens');
  assert.equal(payload.plan, 'vip');
  assert.equal(payload.arrivalOn, '2026-10-01');
  assert.equal(payload.locale, 'en');
});

test('an omitted arrival date is null rather than an empty string', () => {
  // The receiving column is a date; '' is not one, and the schema rejects it.
  const payload = crmContactPayload({ ...FULL_RECORD, arrival: '' });
  assert.equal(payload.arrivalOn, null);
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
