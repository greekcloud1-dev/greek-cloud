# CRM handoff for Claude

## Current state — 2026-09-18: Gmail replaces Resend, confirmed delivered

The email gap described in the 2026-09-17 entry below is closed. Following
the owner's own instruction to stop relying on a third-party sending domain,
`api/submit.js` no longer uses Resend at all -- it sends through nodemailer
over the operator's own Gmail account (`greek-cloud` commit `7e071ca`). Two
independent emails go out per submission: a confirmation to the applicant by
name, and a separate thin summary to the operator, alongside the existing
Telegram notification. `RESEND_API_KEY` has been removed from the Vercel
project entirely (dead weight once the code stopped calling it).

**The operator's own mailbox changed too**, from `greekcloud1@gmail.com` to
`1greek.cloud@gmail.com` (the new address is both the sending account and
the one that receives the operator-summary email). `LEAD_NOTIFY_EMAIL` was
updated to the new address on Vercel (Production and Preview). Setting this
up required, on the new account specifically: enabling 2-Step Verification
(Google will not offer App Passwords without it -- attempting
`myaccount.google.com/apppasswords` beforehand fails with a generic "this
setting isn't available" error that has nothing to do with permissions or
account type, purely 2FA being off) and then generating an app password
under that name, stored only as `GMAIL_APP_PASSWORD` on Vercel, never in
chat or a commit.

**Real end-to-end verification, done against a fresh redeploy of this exact
commit** (a plain `git push` deploy predates env var changes taking effect
on Vercel -- env vars are baked in at build time, so a deployment made
before `GMAIL_APP_PASSWORD` existed would not have picked it up; the fix
each time is a `Redeploy` of that specific commit from the Deployments list,
not the generic dialog off Environment Variables, which defaults to
whichever branch most recently deployed and has to be pointed at the right
one manually). A real multipart `/api/submit` POST against the redeployed
Preview (submission id
`2026-09-17T21-02-25-200Z-3ff9bf5c882c422a`) produced, within the same
request: the CRM case filed normally, a Telegram message in the bot chat,
and -- checked directly in the Gmail web UI for `1greek.cloud@gmail.com`,
not inferred from a provider dashboard -- **both emails sitting in the
Inbox**, not Spam: "הבקשה שלך התקבלה בהצלחה · GreekCloud" to the applicant
and "פנייה חדשה · סטנדרט · אתונה" to the operator. This is the first time in
this whole notification effort that a delivery claim was confirmed by
reading the actual destination mailbox rather than trusting a provider's
"sent" or "delivered" status.

**Bottom line for the owner:** Telegram and both Gmail notifications are all
now confirmed live and landing in the Inbox, on this branch's Preview
deployment. Nothing about the underlying stuck `greekcloud-crm` Production
deployment (below) has changed -- that is still a separate, unresolved
platform issue.

## Current state — 2026-09-17 (later): root-site Telegram/email, verified live

The `greekcloud-crm` Production deployment described as stuck below is still
stuck — that has not changed and needs the owner's own look at the Vercel
dashboard. On the owner's explicit instruction to stop chasing that platform
issue and ship a working notification path instead, the same thin
lead-notification (Telegram + email) was added directly to the root
`greek-cloud` project's own `/api/submit.js`, which is known to deploy
normally. This duplicates the CRM's own notification pipeline once that
project is unstuck; that overlap is intentional, not a bug — two independent
paths to the same phone beat zero.

**Setup done:** a real Telegram bot (`GreekCloudCRM_bot`, chat "GreekCloud CRM
Notifications") was created via BotFather; its token and the chat id are set
as `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` on the `greek-cloud` Vercel
project, scoped to both Production and to Preview-for-this-branch (never
written to a commit or this doc — dashboard-only, per standing instruction).
The branch's own commit with this code (`2e5579c`) had already auto-deployed
to this branch's Preview five hours before the env vars existed, so a fresh
`Redeploy` of that exact same commit/branch was triggered from the
Deployments list (not the generic "Redeploy" dialog off Environment
Variables, which defaults to the most recent deployment of any branch and
has to be pointed at the right one by row-level "..." → Redeploy instead) —
because Vercel bakes env vars into a deployment at build time, so the vars
would not have applied to the already-existing build.

**Real end-to-end result, this session, against the redeployed Preview:**
a genuine multipart `/api/submit` POST (`submissionId`
`2026-09-17T12-06-32-342Z-8f024ecef5184e71`) returned `200 {ok:true}`. The
runtime trace for that request shows outgoing calls to Supabase, the CRM's
own ingest endpoint, `api.resend.com/emails` and
`api.telegram.org/bot***/sendMessage`, with zero Warning/Error/Fatal console
lines — meaning neither notification path threw. The Telegram message
**was independently confirmed** by opening the bot's own chat in Telegram
Web: the exact submission id and content arrived, timestamped 15:06.

**The email did not arrive anywhere** — checked the target inbox, its Spam
label, and Trash directly by Gmail search; nothing from `resend.dev` exists
in that mailbox at all, ever, across every submission this project has ever
sent. Yet the owner's own Resend dashboard (`resend.com/emails`, checked
after they signed in themselves — not something done with stored
credentials) shows every one of them, including this session's test, as
`Sent` → **`Delivered`**: Resend's own event log says Gmail's mail server
accepted the message at the SMTP level. Root cause confirmed on
`resend.com/domains`: **the account has never added or verified a sending
domain — "No domains yet."** Every email this project has ever sent went out
as `onboarding@resend.dev`, Resend's shared sandbox address with no SPF/DKIM
alignment to anything GreekCloud owns. Gmail accepting the message and then
discarding it without a Spam-folder trace is a known behavior toward exactly
this kind of unauthenticated shared-domain sender — not a bug in this
codebase's email path, which never threw an error because, as far as Resend
is concerned, the send succeeded.

**Open item, for the owner specifically (needs their own DNS/registrar
access):** add a domain in Resend (`resend.com/domains` → Add domain) for a
domain they actually control, add the DNS records Resend gives back at
whichever registrar holds that domain, wait for verification, then change
the `from` address in `api/submit.js`'s `sendResendNotification`-equivalent
call away from `onboarding@resend.dev` to an address on that verified
domain. Until that is done, every email this system sends will keep showing
"Delivered" in Resend while never reaching an actual inbox.

**Bottom line for the owner:** Telegram notifications on every new lead are
live and confirmed working right now on this branch's Preview deployment.
Email notifications are wired identically and Resend reports them as
delivered, but they are confirmed to never actually reach the inbox because
no sending domain has ever been verified on this Resend account — Telegram
is the only reliable channel until that DNS work is done.

## Current state — 2026-09-17

Corrects the 2026-09-15 entry below: the storage blocker described there as
"a Supabase-side issue" was not one. Both real bugs found since have now been
fixed and verified with an actual end-to-end submission — but only on the
**preview** deployment of this branch, not on the live `greek-cloud.com`
domain. That distinction matters and is explained at the end of this entry.

**Bug 1 — `SignatureDoesNotMatch` (fixed): manual transcription, not Supabase.**
Every access-key value used up to 2026-09-15 had been read off the Supabase
dashboard (screenshot or accessibility text) and re-typed or pasted into
Vercel by hand. That step was silently corrupting the value. The fix was to
stop reading the value at all: generate a fresh key pair
(`website-root-storage-only-v4` in Supabase's Storage → S3 Connection →
Access keys), use Supabase's own **Copy** button, and
paste directly into Vercel — verified afterward with an independent
`curl --aws-sigv4` request, which returned a clean `200` immediately. Even
with copy/paste, the browser automation used to enter these values had a
separate, reproducible quirk — pasted or typed secrets sometimes gained one
extra leading character — so every paste into a Vercel value field was
visually re-checked (and corrected) before saving. `website-root-storage-only`
and `-v2` (the two dead keys from 2026-09-15) are superseded; only v4 is live
now, on both `greek-cloud` (Production and Preview) and used directly by
`lib/intake-store.js`.

**Bug 2 — the website→CRM bridge silently never fired (fixed).** With
storage working, `/api/submit` was returning a clean `200 {ok:true}` with no
`pending` flag — the code's own signal for "the CRM confirmed the case" — yet
`crm_website_receipts` stayed empty and `greekcloud-crm`'s own request logs
showed zero traffic. Two independent things were wrong at once:

1. `CRM_INGEST_URL` on `greek-cloud` pointed at a stale/incorrect address, not
   the CRM project's actual current domain
   (`https://greekcloud-crm.vercel.app/api/integrations/website`), and
   `CRM_INGEST_SECRET` was not guaranteed to be byte-identical between the two
   projects. Root cause traced by calling the CRM's ingest endpoint directly
   with `curl`: a wrong secret returns `401` from the CRM itself before it
   ever touches Supabase — and Supabase's own request logs (via the `query_logs`
   MCP tool, which reports within a couple of seconds) confirmed zero calls
   ever reached Supabase's REST API in that window. Fixed by generating one
   fresh 48-hex-char secret and setting the same value, plus the corrected
   URL, on both projects (`greek-cloud`: Production and Preview;
   `greekcloud-crm`: Production).
2. Even after that, the CRM's own call to Supabase started returning `401`
   (visible in Supabase's logs as a request straight to
   `/rest/v1/rpc/crm_ingest_website_contact`) or, once the CRM's
   `SUPABASE_SECRET_KEY` was re-copied cleanly from the Supabase dashboard,
   `503 intake_not_confirmed`. The RPC function itself worked fine when called
   directly over SQL — so PostgREST (Supabase's REST layer) simply hadn't
   reloaded its schema cache after the migrations were applied through the
   Supabase MCP tool rather than the CLI, which normally sends that reload
   notice automatically. Running `NOTIFY pgrst, 'reload schema';` once fixed
   it immediately, confirmed by the same `curl` call now returning
   `{"ok":true,"caseId":"…"}`.

**Real end-to-end verification, done properly this time.** A same-shape
`multipart/form-data` POST to `/api/submit` — full name, passport, age, real
selfie bytes, health description, all seven consents — produced, in order:
a `200 {ok:true}` with no `pending` flag; a file at
`submissions/<id>/selfie.jpg` in the private `intake` bucket (confirmed to
exist with a direct signed `HEAD` request, not just recorded as a path); a row
in `crm_contacts`, `crm_cases` and `crm_case_intake` with every field matching
what was submitted; and a queued `crm_notifications` / `crm_event_outbox` row
(`new_case`, in-app, visible to the assigned staff member) recording that a
case and a callback task were created. This was repeated twice for confidence
(case ids `3d2678be…`, `a2add7cb…`), including once after a clean redeploy, to
rule out a fluke.

**Why this ran on preview, not `greek-cloud.com`, and what that means.** The
`greek-cloud` Vercel project's Production deployment tracks the `main`
branch. `main` does not contain this branch's work at all —
`lib/intake-store.js` and `lib/crm-sync.js` do not exist there, and
`api/submit.js` on `main` is still the older Blob+Resend-only version that
never talks to Supabase or the CRM. That is correct and expected: the owner's
merge gate (below) has not been met yet, so this work was never merged, by
design. It also means every fix above — the storage keys, the bridge URL and
secret — only takes effect once this branch reaches production; they are
already set on both Production and Preview scopes so no further environment
work is needed at merge time. The actual test therefore ran against this
branch's own preview deployment
(`greek-cloud-git-claude-adoring-feynman-hff8a6-greekcloud.vercel.app`),
redeployed once during this session so it would pick up the corrected
Preview-scoped environment variables — which is exactly the "or preview"
alternative the original task allowed for step 6.

**Bug 3 — the notification cron was never actually registered.**
`crm/vercel.json` defines a `*/5 * * * *` cron for
`/api/cron/crm-notifications`, and `greekcloud-crm`'s Cron Jobs settings page
showed the empty "get started" state instead of a registered job. Not a
Vercel-plan restriction as first assumed — the real cause is that
`greekcloud-crm`'s Production deployment is still building from commit
`287a505`, from *before* `crm/vercel.json` was added to this branch.

**Fix applied in code, not yet live — a separate platform blocker.** The code
fix follows the owner's own preference regardless of the cron: a new lead now
fires its own notification attempt immediately, in the same request that
files the case (`dispatchCrmNotifications()` called right after
`crm_ingest_website_contact` succeeds in
`app/api/integrations/website/route.ts`, best-effort — a failure there never
changes the response to the website). The claim-with-a-token design in
`crm_claim_notification_deliveries` already makes this safe to run alongside
the cron, so the cron stays in place as a catch-all once it, too, is live.
This is committed and pushed (`d66c471`).

It has **not reached Production**, and not for lack of trying: two plain
`git push`es to this branch and one manually created Vercel deploy hook
(`production-sync`, still present in the CRM project's Git settings, targeting
this branch — POST to it to retry) all completed successfully at the API
level, yet none produced a new deployment, or even a failed/skipped one, for
this project. The project's own Activity log shows every push to `main`
triggering a deployment on schedule, but nothing at all for this branch since
the `287a505` build two days ago — not a code or a git problem, since the
identical commits build fine as `greek-cloud`'s own preview (see the
verification above). This needs the owner's own look at the Vercel dashboard
(a stuck build queue, a quota, or a setting only visible with full account
access are the likely candidates) or a fresh redeploy attempt once whatever
that is clears. Until then: the case, its intake data and the in-app
notification are all confirmed working end to end (above); the immediate
email/Telegram send is written and pushed but unverified, because there is no
live deployment yet to verify it against.

## Earlier state — 2026-09-15 (end of day)

Almost everything from the morning's checklist is done and actually running
in production infrastructure, not just planned. What's below is what changed
today, in the order a maintainer would want to verify it.

**Supabase project**: live, `greekcloud-crm` (ref `yeviskibnwoaamcsxphb`, org
"greekcloud1-dev's", region `eu-central-1`, free tier), all ten migrations
applied and verified (see the `2026-09-15` entry below for the migration-010
security fix). Admin account is active: the owner's auth user
(`greekcloud1@gmail.com`) was invited, confirmed, and its `crm_profiles` row
now has `role='admin'`, `active=true`, `telegram_chat_id` set. Public signup
is disabled (Authentication → Sign In / Providers → "Allow new users to sign
up" is off).

**CRM deployed**: a new Vercel project `greekcloud-crm` (org `greekcloud`,
GitHub repo `greekcloud1-dev/greek-cloud`, Root Directory `crm`, framework
Next.js) tracks this branch for Production and is live at
`greekcloud-crm.vercel.app`. It shows the real invite-only login screen, not
the demo banner, so its Supabase env vars are correct. Vercel Cron is
configured (`crm/vercel.json`, every 5 minutes) to call
`/api/cron/crm-notifications`; Vercel injects `Authorization: Bearer
<CRON_SECRET>` automatically for its own cron calls once `CRON_SECRET` is set
on the project, which it is.

**Telegram is wired**: bot `@GreekCloudCRM_bot` was created via BotFather,
its token is `TELEGRAM_BOT_TOKEN` on the CRM project, `TELEGRAM_CHAT_ID` is
set as the shared default, and the owner's own `crm_profiles.telegram_chat_id`
is set to their personal chat id (obtained by messaging the bot once and
reading `getUpdates`). Not yet verified end-to-end because the storage
blocker below prevents a real case from ever reaching the notification
queue — do that check together once storage is fixed.

**Website ↔ CRM bridge**: both Vercel projects (`greek-cloud` root and
`greekcloud-crm`) have matching `CRM_INGEST_SECRET`, and the root project has
`CRM_INGEST_URL` pointing at the CRM's `/api/integrations/website`. Both are
set on Production and Preview.

**Not working yet — the one real blocker**: the website's Supabase Storage
upload. The design intent (see `CLAUDE.md`) is that the public website must
never hold a key that can read the CRM database, only upload files. Since
every current Supabase API key (publishable or secret) grants full
project-wide access and bypasses RLS, `lib/intake-store.js` was rewritten to
use the S3 protocol instead (Storage → S3 Connection → access keys), which is
the only credential type Supabase actually scopes to Storage. That rewrite
went through two real bugs, both found and fixed by an actual end-to-end
submission against the live project rather than by the test suite (which
stubs storage and never touches the network):

1. Handing a `File`'s own stream straight to `PutObjectCommand` failed with
   "Unable to calculate hash for flowing readable stream" — a stream can only
   be read once, but the SDK needs to re-read it to checksum it. Fixed by
   buffering the file into a `Uint8Array` first (commit `287a505`).
2. After that, every upload failed with `SignatureDoesNotMatch` — including
   from a fresh key pair, from a second fresh key pair, from Node directly
   with `@aws-sdk/client-s3`, and from `curl --aws-sigv4` completely outside
   any of this repo's code. All three independently computed a well-formed
   SigV4 request (confirmed with `curl -v`: correct host, region
   `eu-central-1`, canonical request, `sb-project-ref` header on the
   response proving it reached the right project's gateway) and all three
   got the same clean `SignatureDoesNotMatch` XML error back. Toggling
   "S3 protocol connection" off and back on (Storage → S3 Connection) did not
   help. A guess that the SDK's newer default checksum header
   (`x-amz-checksum-crc32`) was the culprit was tried
   (`requestChecksumCalculation: 'WHEN_REQUIRED'`, commit `67ba856`) and
   did not fix it either — worth keeping since it can only help, but it
   was not the actual cause.

   This now looks like a Supabase-side issue with this project's S3 gateway,
   not something fixable from application code. **Next step: contact
   Supabase support with the project ref and mention that S3-protocol
   requests get `SignatureDoesNotMatch` for freshly generated access keys
   even when verified independently with `curl --aws-sigv4`**, or try again
   after some time in case it is a propagation delay on a newly created
   project. Until this is resolved, every real submission is safely parked
   in Vercel Blob under `unreceived/` rather than lost or silently dropped —
   confirmed by three real end-to-end POSTs to `/api/submit` on the live
   preview deployment, all returning `202 pending` with the submission
   correctly parked.

- New S3 access keys currently on file (both fail identically, kept for
  reference/rotation): `website-root-storage-only`
  (`b07690882ba1b2f595be22ca9ec79ecb`) and `website-root-storage-only-v2`
  (`339613fa7076aca5725bfd7bbfd7a3de`). Both projects' env vars
  (`SUPABASE_STORAGE_KEY_ID` / `SUPABASE_STORAGE_KEY`) currently hold the v2
  pair.
- Not yet done because of the above: a real end-to-end submission that
  actually reaches the CRM as a case (the bridge, Telegram, and email paths
  are all wired but unverified against a real payload).
- Resend and Cloudflare Turnstile were not configured this session — no
  logged-in access to either account was available in this browser. The
  root website's own `/api/submit` does not require Turnstile (only the
  CRM's own public form does, per `crm/.env.example`); Resend's
  `RESEND_API_KEY` already exists on the root Vercel project from before,
  reused for email — the CRM project does not yet have its own.

Project URL: `https://yeviskibnwoaamcsxphb.supabase.co`. The anon/publishable
key is not secret and can be fetched again with the Supabase MCP
`get_publishable_keys` tool, or from the dashboard, when configuring
`crm/.env` — see `crm/.env.example` for the variable names.

## Earlier state — 2026-09-14

Single ownership. The owner asked Claude to take Codex's CRM as built and
continue it alone, so the two-agent synchronization protocol in
`CLAUDE-SYNC-HE.md` no longer applies; `CLAUDE-STATUS-HE.md` is the live
status document and supersedes it. Work lives on `claude/adoring-feynman-hff8a6`.

What changed since the Codex handoff below:

- All eight verified findings in `QA-REPORT-2026-09-09-HE.md` are fixed, each
  with a regression test. Two were reproduced before and after: the mobile
  drawer in a real Chromium at 390x844, and the reminder-ownership bug against
  the real migrations in an in-memory PostgreSQL.
- Four new migrations (006-009). A fresh install now runs **nine** in filename
  order, not five.
- The website bridge carries the whole submission, not five operational fields:
  plan, estimated arrival date, language, and — at the owner's explicit decision
  of 2026-09-14 — passport, age, the health description, the prescription answer
  and the recorded consents. `CLAUDE.md` records that decision; an earlier rule
  there forbade it, and was changed on purpose.
- Storage is one system. The files moved from Vercel Blob into a private
  Supabase bucket in the CRM's own project, so a case and its files share one
  backup and one deletion. Blob remains configured as a holding area that is
  written to only when Supabase or the bridge refuses, so an outage never loses
  a submission. See `CRM-INTEGRATION.md` for the field mapping and the failure
  behaviour.
- New files: `crm/lib/crm/weekly.ts` (the seven-day window, kept outside
  `server-only` `store.ts` so it can be tested), `assets/intake-draft.js` (the
  intake draft storage policy, split out for the same reason), and `tests/` at
  the repository root for site-side tests.
- `main` advanced seven commits in parallel and is now merged into the branch.
  The site went live on `greek-cloud.com` with indexing enabled, and a separate
  Claude session independently hardened `api/submit.js` and `assets/intake.js`
  — the same two files this work had changed. The conflicts were resolved by
  combining both sides; see `CLAUDE-STATUS-HE.md` for which side won where and
  why. `crm/` itself had no conflicts: none of those seven commits touch it.

Merge gate, set by the owner: do **not** merge to `main` as a technical
milestone. Merge only once the CRM is actually wired to Supabase, Turnstile and
mail/Telegram, deployed as its own project, and checked end to end.

## Security update — 2026-09-08

Read `crm/SECURITY-HANDOFF.md` before activation. Local hardening adds migration
`202609080005_security_hardening.sql`, direct-database audit/assignment protection,
safe repeated intake, mandatory Turnstile, logout cleanup, nonce CSP, auth request
guards and persistent notification-failure reporting. Existing unpublished work
is preserved. There are 29 isolated tests plus 2 optional localhost HTTP tests;
production build and dependency audits passed. No cloud configuration, deployment,
publication or live delivery was performed. Intake remains unavailable (503).

## User-approved direction

The owner supplied the administrator email in the task; it is intentionally not
published in this repository. No account or password has been created.
Target repository: `greekcloud1-dev/greek-cloud`.

Build a lightweight internal CRM, Hebrew only and mobile-first, installable on
the home screen. One operational pipeline; a contact can have multiple cases.
Track flight date/time and time remaining. Include callback tasks, notes, audit
history, search, source analytics, in-app notification strip, email and Telegram.
Payment is only a manual status: paid, unpaid, refunded. There is no checkout.
WhatsApp initially uses editable prefilled links and explicit manual contact logging.
Full automatic WhatsApp conversation sync is not implemented or activated.

## Repository integration

The first implementation was built in a separate local Next.js prototype. Once
the owner confirmed this repository, only the CRM was brought into `crm/`.
The root site remains the original static site; its medical-file intake remains
separate. Do not copy the prototype's public marketing pages over this site.

Deploy `crm/` as a separate Next.js project, preferably on an owner-selected
subdomain. This avoids changing the root static site's hosting and intake flow.
`crm/` redirects to `/crm`; `/request` is a separate contact-only public form.

## Code map

| Path inside crm | Responsibility |
| --- | --- |
| `app/crm/page.tsx`, `lib/crm/auth.ts` | Server authentication and active-staff gate |
| `app/crm/login`, `app/crm/auth`, `app/crm/account` | Login, logout, invitation confirmation and password recovery |
| `components/crm/AccountForm.tsx` | Shared accessible password/reset forms; provider errors remain visible |
| `components/crm/CrmApp.tsx` | Dashboard, cases, tasks, analytics and dialogs |
| `components/crm/use-crm-data.ts` | Client loading, refresh, write/error state; no local customer persistence |
| `components/crm/crm-data.ts` | UI types and explicitly labeled demo fixtures |
| `app/api/crm/data`, `app/api/crm/mutate` | Authenticated read/write boundary |
| `lib/crm/store.ts` | Validation, Hebrew mappings, DB operations and computed metrics |
| `lib/crm/whatsapp.ts` | Neutral editable message templates and URL construction |
| `app/request`, `components/request`, `lib/request` | Contact form with review, consent and spam checks |
| `app/api/leads` | Contact-only public intake transaction |
| `lib/notifications`, `app/api/cron/crm-notifications` | Reminder queue, leases, provider adapters and retry handling |
| `supabase/migrations` | Schema, RLS, transactional RPCs, audit and notification jobs |

Database uses UTC timestamps, displayed in Israel time. The staff datetime input
explicitly uses the device timezone; the public form has a timezone selector.
Flight countdowns are computed from timestamps, never saved as a fixed number.
The progress indicator is completed tasks / all tasks, not medical readiness.

## Deployment and activation

1. In `crm/`, install with `pnpm install --frozen-lockfile`, then `pnpm build`.
2. Create the Supabase project, then apply the schema.

   On a **new, empty** project: paste `crm/supabase/schema-complete.sql` into
   the SQL Editor and run it once. It is generated from the migration files in
   filename order, so it is the same thing in a single paste. Regenerate it
   rather than editing it, or the two will disagree.

   On a project that **already has some of this**: apply the individual files
   from `crm/supabase/migrations/` that it is missing, in filename order.
   Re-running the combined script is not safe. The recent additions are
   `202609110006_reminder_ownership.sql`,
   `202609140007_website_bridge_operational_fields.sql`,
   `202609140008_intake_full_record.sql` and `202609150009_intake_storage.sql`.

   Either way, 009 creates the private `intake` bucket the website uploads to,
   so the schema must be applied before the website is configured.
3. Disable public signups, invite the owner's auth account, and explicitly set its
   `crm_profiles.role='admin'` and `active=true`. Follow `crm/supabase/README.md`.
   Configure the invitation and recovery email templates described there. The
   owner chooses their own password; do not ask them to share it. Account-link
   confirmation uses an explicit POST so email link scanners do not consume it.
4. Add environment variables from `crm/.env.example` to the separate CRM project.
5. Enable email with verified sender and Telegram with bot/chat; follow
   `crm/NOTIFICATION-SETUP.md`. Cron endpoint requires a server-only secret.
6. Configure the optional site bridge only after the CRM is reachable over HTTPS
   **and step 3's admin is active**. Every incoming lead is assigned to an active
   staff member; with none, intake fails with "No active CRM user is available
   for lead assignment" and the website request stays pending.
7. Check a test contact end-to-end before using real customer records. The bridge
   path is verified in `crm/tests/schema.test.mjs` and `lib/crm-sync.test.js`
   against the real SQL, but neither exercises a real Supabase instance.

Missing Supabase credentials intentionally show sample data with a persistent
demo banner. Demo edits disappear on refresh; demo phone/WhatsApp links do not
contact sample numbers. Public form submission returns unavailable when not set up.

## Checks and known limits

Latest local verification (2026-09-14, after merging `main`): `pnpm typecheck`
clean, `pnpm build` passes, and `pnpm test` from `crm/` reports **69 tests — 67
passed, 0 failed, 2 skipped**. The two skips are the optional localhost HTTP
tests, which need `CRM_TEST_ORIGIN` and a running server; everything else is
isolated. Site-side tests now run in the same command: `crm/package.json` also
points `node --test` at `../tests/*.test.mjs`, and `.github/workflows/crm-checks.yml`
watches `assets/**` and `tests/**` as well.

These are local checks, not a deployed acceptance test. Production persistence is
still unverified against a real Supabase project, and email/Telegram delivery has
never been activated or tested against real recipients.

Coverage, by area: schema and RLS across all six migrations (creation, contact
reuse, website replay, inactive/anonymous access, privilege protection, immutable
audit history, reminder deduplication, delivery leases, bridge data boundaries);
reminder ownership on handover; the seven-day analytics window; case search
fields; session and logout cleanup; request protection; and, on the site side,
the intake draft storage policy and `/api/submit` validation with stubbed
providers. The migrations execute on isolated PostgreSQL (PGlite) with a minimal
Supabase Auth contract.

Two independent security reviews were run over this branch against `main` and
found no HIGH or MEDIUM issues: one over the whole diff (CRM routes, libraries,
RLS policies, SECURITY DEFINER functions, the website bridge), one specific to
the hand-merged `api/submit.js`. A real Supabase environment still needs
auth/session and provider checks before activation; neither review substitutes
for that.

Explicit SQL review fixes: qualified intake RETURNING column names; transactional
assignment notifications; 15-minute default task reminders; stale assignment
filtering, plus two colliding automatically named CHECK constraints found during
database execution. Staff access checks Auth identity AND active profile. APIs use RLS;
only public intake and cron use server-only service credentials.

No service worker caches customer records. Manifest enables home-screen use;
the app requires network access. Do not add offline record caching casually.
The dashboard currently loads a bounded operational dataset (10,000 cases,
50,000 activities); it fails visibly above this instead of displaying partial totals.
Before significant growth, add server-side pagination and aggregate reporting.

## Next maintainer checklist

- Latest customer-perspective test: see `crm/INTAKE-VERIFICATION.md`. Synthetic
  intake is blocked by missing backend configuration (HTTP 503), not successfully
  received. On the flight-date suspicion that file raises, the QA report's
  follow-up found no bug under normal keyboard entry; it stays unconfirmed rather
  than open.
- Work continues on `claude/adoring-feynman-hff8a6`, which is merged up to date
  with `main`. `codex/mobile-crm` is the original publication branch and is
  historical now — do not build on it.
- The site is live and indexed. Anything touching the repository root (`api/`,
  `assets/`, the HTML pages) reaches real visitors on merge; `crm/` does not,
  because it deploys as a separate project that is not connected yet.
- Preserve Hebrew RTL and keyboard/focus behavior when changing dialogs.
- Keep API contracts aligned with UI form validation and `crm-data.ts`.
- Keep writes atomic when they create multiple related records.
- Never show success for a failed write or infer message delivery from a link click.
- Keep external notification content to case reference and authenticated link.
- Record new setup requirements and test results here for the next person/agent.
