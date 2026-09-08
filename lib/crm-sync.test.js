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

test('bridge sends only the operational field allowlist', () => {
  const payload = crmContactPayload({ submissionId:'test-001',fullName:'Test',phone:'+972500000000',email:'test@example.com',city:'Athens',passport:'never-send',condition:'never-send',selfiePath:'never-send',arrival:'2026-10-01' });
  assert.deepEqual(Object.keys(payload), ['submissionId','fullName','phone','email','destination']);
  assert.ok(!JSON.stringify(payload).includes('never-send'));
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
