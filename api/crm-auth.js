/* GET /api/crm-auth — Google sign-in for the CRM (start, and Google's callback). */
import { createAuthHandler } from './_lib/auth.js';
import { blobStore } from './_lib/store-blob.js';

export default { fetch: createAuthHandler({ env: process.env, store: blobStore() }) };
