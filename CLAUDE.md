# GreekCloud — instructions for Claude and future maintainers

For the Hebrew owner-to-developer synchronization brief, read `CLAUDE-SYNC-HE.md`.
It is a dated handoff, not proof that local changes are available on GitHub.

Read `CRM-HANDOFF.md` before working on the new CRM. It explains the decisions,
file map, setup sequence, verified behavior, and remaining activation work.

## Two applications in one repository

- Repository root: the existing static Hebrew/English website and its Vercel
  `api/submit.js` private-file intake. Keep its root deployment configuration.
- `crm/`: an independent Next.js application, Hebrew only, with its own package,
  lockfile and deployment root. Start or build it from that directory.

Do not replace the static website with the CRM build or change the existing
Vercel project's root directory to `crm`. Use a separate project for the CRM.

The CRM holds contacts, cases, tasks, flight timing, manual payment status and
audit history, and — since 2026-09-14, by the owner's explicit decision — the
full public-intake submission: passport number, age, the health description,
the existing-prescription answer and the recorded consents. An earlier rule here
forbade that; it was changed deliberately, not forgotten. Do not "restore" it.

Storage is one system, deliberately. The files live in a private Supabase
bucket in the same project as the CRM database, so a case and its files are one
row and one prefix under one backup and — the reason that actually decided it —
**one deletion**. An earlier design kept the files and a `record.json` in Vercel
Blob while the case lived in Supabase; erasing a customer then took two jobs in
two systems, and a miss in either leaves a face photo behind after somebody
asked to be forgotten.

What that means in practice, and must not be undone:

- **Blob is a holding area, not a store.** Nothing is written to it when the
  normal path works. If Supabase or the bridge refuses, the submission is
  parked under `unreceived/` with the reason and the visitor is told it is
  pending rather than received — so no one is ever lost to an outage. That
  prefix existing at all is the alert. See `lib/intake-store.js`.
- **The website holds a Storage-scoped key and nothing more.** It must never
  hold a key that can read the CRM database: if the public site is compromised,
  the blast radius should be the files, not every customer. That is why the
  record still travels through the authenticated bridge, which the CRM owns.
- **No Blob URL, signed URL or token is ever stored.** Only object paths cross,
  and the CRM signs one for five minutes when a staff member opens a file.
  `lib/crm-sync.js` drops anything that is not a path inside the intake prefix.

The bridge payload is an explicit list, never a spread. Adding a field means
changing `lib/crm-sync.js`, the strict schema in
`crm/app/api/integrations/website/route.ts` and the SQL function together — the
receiver rejects any key it does not name.

Consequences worth stating plainly, because they are live: the health
description is special-category data, the CRM permission model is a shared team
(every active staff member can read every case), and `crm_case_intake` is
read-only to staff — it records what the customer wrote, so a correction belongs
in a case note. `SECURITY-NOTES.md` still lists retention and a processor
agreement as open items.

Use `crm/.env.example` for variable names. Never commit credentials. Missing
Supabase configuration means a clearly marked temporary demo, not live storage.
Do not describe integrations as active until their real credentials and end-to-end
checks are complete. New auth users require explicit CRM staff activation.

For Next.js changes, read the relevant version-specific documentation bundled in
`crm/node_modules/next/dist/docs/` before assuming APIs or conventions.
