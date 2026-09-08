# GreekCloud CRM — Supabase setup

The CRM schema is intentionally limited to operational information: contacts,
cases, flight timing, tasks, payment status, an activity trail, and notification
delivery state. Do not store medical details, passport identifiers, uploaded
documents, or WhatsApp message bodies and attachments in these tables.

## 1. Create and configure the Supabase project

1. Create a Supabase project in an appropriate region.
2. In Authentication settings, disable open public sign-up. Staff accounts must
   be created with an admin invitation.
3. Apply all files in `migrations/` in filename order with the Supabase CLI or SQL editor.
4. Copy `.env.example` to `.env.local` and provide the Supabase URL and keys.
   `SUPABASE_SECRET_KEY` is server-only and must never be rendered or sent
   to a browser.

The migration creates a profile automatically whenever an invited email user is
created. New profiles receive the `agent` role and remain inactive until explicitly
activated; user metadata never assigns administrator access.

## 2. Bootstrap the first administrator

After creating the first staff account, run this
from the Supabase SQL editor while connected as the project owner:

```sql
update public.crm_profiles
set role = 'admin', active = true
where email = 'replace-with-the-admin-email@example.com';
```

Do not expose an endpoint that promotes the first user automatically. Further
role and account changes should be available only to an authenticated admin.
For further invited staff, set `active = true` after verifying the account. Configure
their login password through Supabase's secure invitation/recovery flow. The CRM
currently accepts email/password login and does not offer public registration.

### Invitation and password recovery links

Set Supabase Auth Site URL to the HTTPS CRM origin. In the invitation email
template, use `{{ .SiteURL }}/crm/auth/confirm?token_hash={{ .TokenHash }}&type=invite`.
In the reset-password template, use
`{{ .SiteURL }}/crm/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`.
The confirmation page consumes the one-time token only after a deliberate button
press, then opens the password form. The owner enters their own password; never
put it in code or deployment variables. `/crm/account/reset` requests another
link. Add the CRM origin/account routes to the Supabase redirect allowlist.

## 3. Access model

- Anonymous clients receive no direct table or analytics-view grants.
- The public lead form must call a server-side route that validates and
  rate-limits the request, checks CAPTCHA, and then uses the service role.
- Active staff can view and work with operational contacts, cases, tasks, and
  the activity timeline.
- Only admins can edit staff roles or message templates.
- A staff member can mark only their own notification rows as read.
- Activity rows are append-only to authenticated clients; no update or delete
  grant is provided.
- Outbox and delivery mutations are reserved for a server-side worker using the
  service role.

The server-side intake route should call `public.crm_intake_lead(...)`. This
single transaction normalizes and reuses an E.164 phone contact, creates a new
case under that contact, assigns an active staff member, creates a callback
task, records its operational activities, creates the in-app notification, and
queues the notification outbox event. Execution is explicitly revoked from
`anon` and `authenticated` and granted only to `service_role`.

The function accepts only structured contact, service, flight, source, and UTM
parameters. Validate the same input again in the route before the RPC call; do
not add a generic notes, medical-details, passport, or document payload to this
function.

Row-level security is enabled on every CRM table. The analytics views use
`security_invoker`, so they retain the caller's underlying row-level policies.

## 4. Notifications

The database automatically creates default per-user notification preferences
and adds a `new_case` event to `crm_event_outbox` when a case is created. A
scheduled server worker at `/api/cron/crm-notifications` implements:

1. Claim queued outbox rows with a database transaction and `skip locked`.
2. Resolve the recipients and their preferences.
3. Insert one `crm_notifications` row per recipient using a deterministic
   `dedupe_key`.
4. Insert delivery rows for in-app, email, and Telegram channels.
5. Send external notifications and update delivery/outbox status with bounded
   retries.

Use `CRON_SECRET` to protect the worker route. Keep notification text
operational and do not include customer-sensitive free text in email or
Telegram messages.

For email, configure `NOTIFICATION_FROM_EMAIL` and a
verified sender domain with `RESEND_API_KEY` (or replace the provider adapter
while preserving the delivery table). Notifications go to each staff profile's email.
See `../NOTIFICATION-SETUP.md` for queue, retry and scheduling details. For Telegram, create a bot with BotFather,
set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, and use either a shared
operations group or a per-user chat ID. A bot cannot message a user until that
user starts the bot or the bot is added to the target group.

## 5. WhatsApp

The MVP can open a prefilled `wa.me` link and therefore needs no Meta API key.
Use a dedicated WhatsApp Business number. Opening a link cannot prove that a
message was sent or read, so the CRM should record only the button action and a
manual operational outcome.

The optional Cloud API variables in `.env.example` are reserved for a later
integration. Adding an inbox or automatic conversation history requires a
separate privacy and retention decision. It must not introduce message bodies,
attachments, medical data, passport data, or document contents into this CRM
schema.

## 6. Data and mobile security notes

Read `../SECURITY-HANDOFF.md` before activation. Apply the additive
`202609080005_security_hardening.sql` migration after 001–004. Both Turnstile keys
are now required for public intake. Configure NEXT_PUBLIC_SITE_URL as the exact
CRM origin; authentication actions reject absent/untrusted origins. This does
not replace Supabase Auth rate limits, session/MFA policy or a shared edge throttle.

- The installable web app may cache static assets only. Do not cache CRM pages,
  API responses, contacts, cases, or notifications in a service worker.
- Store flight timestamps as UTC plus the supplied IANA timezone. Calculate the
  countdown when reading the case; never persist a countdown value.
- The interface records only paid/unpaid/refunded. It does not process payments.
- Keep structured logs free of names, phone numbers, email addresses, and
  operational notes.
- Backups, retention, deletion, session lifetime, and staff offboarding should
  be reviewed before production launch.
