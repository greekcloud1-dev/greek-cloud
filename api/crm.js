/* GET/POST /api/crm?action=… — the CRM's data. Logic lives in _lib/crm-api.js.
   Node runtime: @vercel/blob needs Node built-ins that Edge does not provide. */
import { createCrmHandler } from './_lib/crm-api.js';
import { blobStore } from './_lib/store-blob.js';

export default { fetch: createCrmHandler({ env: process.env, store: blobStore() }) };
