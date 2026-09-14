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

The CRM holds operational contacts, cases, tasks, flight timing, manual payment
status and audit history. It must not receive medical descriptions, passport
numbers, selfies, prescriptions, uploaded files or private Blob URLs from the site.
The optional website bridge sends only explicitly listed operational fields:
submission id, name, phone, email, destination, plan, estimated arrival date and
locale. Adding a field there means deciding it is operational rather than medical
or identifying, and changing `lib/crm-sync.js`, the strict schema in
`crm/app/api/integrations/website/route.ts` and the SQL function together.

Use `crm/.env.example` for variable names. Never commit credentials. Missing
Supabase configuration means a clearly marked temporary demo, not live storage.
Do not describe integrations as active until their real credentials and end-to-end
checks are complete. New auth users require explicit CRM staff activation.

For Next.js changes, read the relevant version-specific documentation bundled in
`crm/node_modules/next/dist/docs/` before assuming APIs or conventions.
