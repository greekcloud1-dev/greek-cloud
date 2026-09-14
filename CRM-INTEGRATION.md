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
constructed field by field — eight of them, as of migration 007:

| Field | Becomes | Note |
| --- | --- | --- |
| `submissionId` | receipt key | Makes a replay idempotent |
| `fullName`, `phone`, `email` | the contact | Phone is the identity; a returning caller reuses the contact |
| `destination` | `crm_cases.destination` | The city chosen on the form |
| `plan` | `crm_cases.intake_plan` | `standard` or `vip` — which tier was bought |
| `arrivalOn` | `crm_cases.intake_arrival_on` | A date, **not** `flight_at`; see below |
| `locale` | `crm_contacts.locale` | `he` or `en` — answer them in it |

It does not transmit passport, age, health description, the existing-prescription
answer, prescriptions, selfies, file paths or download URLs. The receiving schema
is `.strict()`, so an unrecognised key is a rejected request rather than a
silently accepted one.

**Approximate arrival is not flight time.** `intake_arrival_on` is a calendar
date the visitor estimated; `flight_at` is a confirmed instant that drives the
reminder countdowns. Writing the first into the second would run reminders
against a guess, so staff set `flight_at` themselves once a flight is confirmed.
The CRM shows the submitted arrival separately, below the flight facts.

The three added fields are optional end to end: they default to null in SQL, so
a site deployment that predates migration 007 keeps working and simply records
nothing in the new columns rather than failing every intake.

The CRM creates/reuses the phone contact, opens an operational case, creates a
callback task and notification. Requests with the same submissionId return the
same case, even if a previous response timed out. Existing website contact requests
default to email; no WhatsApp marketing opt-in is inferred — the site form has no
WhatsApp consent box, so inferring one would be inventing consent.

**The bridge needs an active CRM staff member to exist before it is switched on.**
Every incoming lead is assigned to one, and intake fails outright with "No active
CRM user is available for lead assignment" if there is none. Invite and activate
the admin first (step 3 in `CRM-HANDOFF.md`), then configure the bridge.

The source record contains a durable pending sync intent. When configured, a
separate private `submissions/<id>/crm-delivery.json` stores the outcome. A CRM
failure does not fail or discard the original saved application. Missing bridge
configuration skips the network call; activating it does not automatically replay
historical records. Manual retry must use the same allowlisted payload and same
submissionId. There is no public endpoint for reading Blob records or bulk replay.

Before activation, test on disposable data: successful sync, repeat same ID,
unavailable CRM, invalid secret, malformed phone, and rejection of an extra
medical/passport field. Never send a full Blob record to the bridge.
