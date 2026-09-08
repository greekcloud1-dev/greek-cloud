# Existing website → CRM

The root website stays a static Vercel project. Deploy the independent `crm/`
Next.js app as a second project. Do not change the existing project's root directory.

On the **existing website**, configure:

- `CRM_INGEST_URL=https://<crm-host>/api/integrations/website`
- `CRM_INGEST_SECRET`: a random server-only secret of at least 32 characters.

On the **CRM project**, configure the same `CRM_INGEST_SECRET`, the Supabase
variables in `crm/.env.example`, and apply all migrations in order.

`api/submit.js` still first saves its existing private files and record. After
that succeeds, it optionally calls `lib/crm-sync.js`. The payload is deliberately
constructed field by field: submissionId, fullName, phone, email, destination.
It does not transmit passport, age, health description, prescriptions, selfies,
file paths or download URLs. Approximate arrival is not assumed to be flight time.

The CRM creates/reuses the phone contact, opens an operational case, creates a
callback task and notification. Requests with the same submissionId return the
same case, even if a previous response timed out. Existing website contact requests
default to email; no WhatsApp marketing opt-in is inferred.

The source record contains a durable pending sync intent. When configured, a
separate private `submissions/<id>/crm-delivery.json` stores the outcome. A CRM
failure does not fail or discard the original saved application. Missing bridge
configuration skips the network call; activating it does not automatically replay
historical records. Manual retry must use the same allowlisted payload and same
submissionId. There is no public endpoint for reading Blob records or bulk replay.

Before activation, test on disposable data: successful sync, repeat same ID,
unavailable CRM, invalid secret, malformed phone, and rejection of an extra
medical/passport field. Never send a full Blob record to the bridge.
