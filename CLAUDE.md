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

Two things still do not cross, and reinstating either would be a mistake:

- **File bytes.** The selfie and the prescription stay in the website's private
  Blob storage. The CRM stores only their basenames and mints a five-minute
  signed link through `api/intake-file.js` when a staff member asks. Copying the
  files into the CRM would mean a face photo and a prescription living in two
  systems, where deleting one does not delete the other.
- **Blob URLs or tokens.** Nothing durable in the CRM database grants access to
  a file. `lib/crm-sync.js` reduces a stored path to its basename and drops
  anything that is not one.

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
