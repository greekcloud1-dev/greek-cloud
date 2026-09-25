# Drift baseline

`baseline.json` is a snapshot of SEO-critical elements (title, meta
description, canonical, hreflang, H1s, JSON-LD types and node count) for every
indexable page, captured by `node scripts/drift-snapshot.mjs`.

R1 (`seo/routines/R1-health-drift.md`) compares each day's live state against
this file. Refresh it only for changes classified as **intentional** — see
that runbook §3. Do not hand-edit it; regenerate with the script.

Last captured: 2026-09-23 (first run — no prior baseline existed).
