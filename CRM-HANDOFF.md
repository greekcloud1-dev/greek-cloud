# CRM handoff for Claude

## Publication authorization update

The owner has now requested publishing the CRM source and handoff documents to
the public repository for Claude's review. Target branch: `codex/mobile-crm`,
with a draft PR into `main`. This supersedes earlier pending-publication notes;
it does not authorize merging, production deployment or cloud account changes.

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
2. Create Supabase project; apply all SQL migrations in filename order.
3. Disable public signups, invite the owner's auth account, and explicitly set its
   `crm_profiles.role='admin'` and `active=true`. Follow `crm/supabase/README.md`.
   Configure the invitation and recovery email templates described there. The
   owner chooses their own password; do not ask them to share it. Account-link
   confirmation uses an explicit POST so email link scanners do not consume it.
4. Add environment variables from `crm/.env.example` to the separate CRM project.
5. Enable email with verified sender and Telegram with bot/chat; follow
   `crm/NOTIFICATION-SETUP.md`. Cron endpoint requires a server-only secret.
6. Configure the optional site bridge only after the CRM is reachable over HTTPS.
7. Check a test contact end-to-end before using real customer records.

Missing Supabase credentials intentionally show sample data with a persistent
demo banner. Demo edits disappear on refresh; demo phone/WhatsApp links do not
contact sample numbers. Public form submission returns unavailable when not set up.

## Checks and known limits

Latest local verification (2026-09-08): production build passes with account
invitation/recovery routes included; all 13 tests pass. The repository app's
mobile contact form advances to review, focuses the review heading, and disables
submission without backend configuration. The mobile pages checked have no
horizontal overflow. These are local checks, not a deployed acceptance test.

The repository's standalone CRM passed Next.js production build and TypeScript checks. Desktop and
390px mobile browser checks covered case creation, payment status, task creation,
flight editing and operational note display. Production persistence is not yet
verified against a real Supabase project. Email/Telegram delivery has not been
activated or tested against real recipients. The migrations now execute successfully
on isolated PostgreSQL (PGlite) with a minimal Supabase Auth contract. Thirteen tests
cover creation, contact reuse, website replay, inactive/anonymous access, privilege
protection, immutable audit history, reminder deduplication, leases and bridge data
boundaries. Run `pnpm test` from `crm/`. A real Supabase environment still needs
auth/session and provider checks before activation.

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
  received. The flight review needs manual-input reproduction before acceptance.
- Review the owner-authorized `codex/mobile-crm` publication separately from any
  future production merge or deployment; verify the remote branch is available.
- Preserve Hebrew RTL and keyboard/focus behavior when changing dialogs.
- Keep API contracts aligned with UI form validation and `crm-data.ts`.
- Keep writes atomic when they create multiple related records.
- Never show success for a failed write or infer message delivery from a link click.
- Keep external notification content to case reference and authenticated link.
- Record new setup requirements and test results here for the next person/agent.
