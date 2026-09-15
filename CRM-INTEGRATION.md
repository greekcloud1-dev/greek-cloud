# Existing website → CRM

The root website stays a static Vercel project. Deploy the independent `crm/`
Next.js app as a second project. Do not change the existing project's root directory.

On the **existing website**, configure:

- `CRM_INGEST_URL=https://<crm-host>/api/integrations/website`
- `CRM_INGEST_SECRET`: a random server-only secret of at least 32 characters.

On the **CRM project**, configure the same `CRM_INGEST_SECRET`, the Supabase
variables in `crm/.env.example`, and apply all migrations in order.

`api/submit.js` uploads the files to Supabase Storage, then calls
`lib/crm-sync.js` to file the submission as a case. The bridge call is what
makes the submission real, so its result decides the reply. The payload is
constructed field by field, never spread:

| Field | Becomes | Note |
| --- | --- | --- |
| `submissionId` | receipt key | Makes a replay idempotent |
| `fullName`, `phone`, `email` | the contact | Phone is the identity; a returning caller reuses the contact |
| `destination` | `crm_cases.destination` | The city chosen on the form |
| `plan` | `crm_cases.intake_plan` | `standard` or `vip` — which tier was bought |
| `arrivalOn` | `crm_cases.intake_arrival_on` | A date, **not** `flight_at`; see below |
| `locale` | `crm_contacts.locale` | `he` or `en` — answer them in it |
| `passport`, `age`, `condition`, `rxState`, `consents` | `crm_case_intake` | The full submission, per the owner's decision of 2026-09-14 |
| `selfiePath`, `rxPath` | `crm_case_intake` | Object paths in the private bucket — see below |

The receiving schema is `.strict()`, so an unrecognised key is a rejected
request rather than a silently accepted one, and the payload in
`lib/crm-sync.js` is an explicit list rather than a spread.

### One storage system

The selfie and the prescription live in a **private Supabase bucket in the same
project as the CRM database**, created by migration
`202609150009_intake_storage.sql`. A case and its files are one row and one
prefix in one system: one backup, one set of access rules, and one deletion.

Only the object path crosses the bridge (`submissions/<id>/selfie.jpg`). When a
staff member opens a file the CRM calls Supabase's own `createSignedUrl` for
five minutes, through the caller's RLS-scoped client — so someone who cannot
read a case cannot read its intake row, cannot learn the path, and cannot sign
it. No URL or token is ever stored.

The website needs two variables for this: `SUPABASE_URL` and
`SUPABASE_STORAGE_KEY`. **The key must be scoped to Storage and nothing else.**
The public site must not be able to read the CRM database; if it is ever
compromised, the reachable surface should be the files, not every customer.
That is why the record still goes through the authenticated bridge rather than
the website writing to the tables directly.

### Nothing is lost to an outage

Vercel Blob is still configured, but it is a holding area rather than a store,
and **nothing is written to it when the normal path works** — otherwise the
single-deletion property above would be quietly false.

If Supabase refuses the upload, or the bridge does not confirm the case, the
whole submission (answers and files) is parked under `unreceived/<id>/` with
the reason, and the visitor gets `202 { pending: true }` rather than a success.
If both refuse, the reply is `503 not_stored` — never a success for something
that was not stored. Anything under `unreceived/` is waiting to be recovered;
that prefix existing at all is the alert.

A failed notification email is separate and much less serious now: the case is
already in the CRM, so nobody learns about a submission only from the email.
The failure still leaves a receipt at `notify-failed/<id>.json` carrying an id,
a case id and a reason — no personal data, so it is not a second copy of
anything.

The CRM creates/reuses the phone contact, opens an operational case, creates a
callback task and notification. Requests with the same submissionId return the
same case, even if a previous response timed out. Existing website contact requests
default to email; no WhatsApp marketing opt-in is inferred — the site form has no
WhatsApp consent box, so inferring one would be inventing consent.

**The bridge needs an active CRM staff member to exist before it is switched on.**
Every incoming lead is assigned to one, and intake fails outright with "No active
CRM user is available for lead assignment" if there is none. Invite and activate
the admin first (step 3 in `CRM-HANDOFF.md`), then configure the bridge.

A replay is safe: the same `submissionId` returns the same case rather than
creating a second one, so recovering a parked submission is just re-sending it.
Missing bridge configuration is treated as a refusal, not as success — the
submission is parked rather than silently dropped. There is no public endpoint
for reading storage or for bulk replay.

Before activation, test on disposable data: a successful submission, the same id
sent twice, an unreachable CRM, an invalid secret, a malformed phone, and an
extra field the strict schema should reject. Never send a whole intake record to
the bridge — only the field list above.
