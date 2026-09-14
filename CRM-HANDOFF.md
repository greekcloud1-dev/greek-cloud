# CRM handoff for Claude

## Current state — 2026-09-14

Single ownership. The owner asked Claude to take Codex's CRM as built and
continue it alone, so the two-agent synchronization protocol in
`CLAUDE-SYNC-HE.md` no longer applies; `CLAUDE-STATUS-HE.md` is the live
status document and supersedes it. Work lives on `claude/adoring-feynman-hff8a6`.

What changed since the Codex handoff below:

- All eight verified findings in `QA-REPORT-2026-09-09-HE.md` are fixed, each
  with a regression test. Two were reproduced before and after: the mobile
  drawer in a real Chromium at 390x844, and the reminder-ownership bug against
  the real migrations in an in-memory PostgreSQL.
- New migration `202609110006_reminder_ownership.sql`. A fresh install now runs
  **six** migrations in filename order, not five.
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
2. Create Supabase project; apply all six SQL migrations in filename order. On an
   existing install that already has 001-005, add `202609110006_reminder_ownership.sql`
   alone rather than re-running everything.
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
