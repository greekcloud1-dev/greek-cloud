/* GET /api/crm-cron — daily "who is stuck" alert. Called by Vercel Cron with
   Authorization: Bearer $CRON_SECRET; anything else gets a 401. */
import { createCronHandler } from './_lib/cron.js';
import { blobStore } from './_lib/store-blob.js';

export default { fetch: createCronHandler({ env: process.env, store: blobStore() }) };
