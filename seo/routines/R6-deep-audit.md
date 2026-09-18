# R6 · Monthly deep audit

Monthly, 1st at 11:00 Asia/Jerusalem.

The wide pass the weekly routines are too narrow to do. Its output is a refreshed
action plan, not a pile of findings.

---

## 1. Technical and performance

Use `seo-technical` across the site: crawlability, indexability, security headers,
URL structure, mobile, and structured data.

For Core Web Vitals, run `unlighthouse` over all indexable URLs — it is free,
local, and does not burn a PageSpeed quota. Compare against the thresholds in
`seo/config.json` (`lcpMs` 2500, `inpMs` 200, `cls` 0.1) and against last month's
report.

Context for judging a regression: a previous pass took mobile LCP from 3.26s to
2.0s and CLS from 0.055 to 0.003 by self-hosting fonts, merging three stylesheets
into `base.css`, and preloading the LCP faces. If LCP has moved back above 2.5s,
check first whether something reintroduced a render-blocking resource.

## 2. Content quality

Use `seo-content` for E-E-A-T and citability across the site, and `seo-images` for
alt text, formats and CLS-prevention attributes.

Two known gaps that will surface every month until the owner acts, so state them
briefly and do not re-litigate them:

- **no reviews and no `Review`/`AggregateRating` schema** — the widest gap against
  medtouristgr.com, and it needs real customers, not markup
- **organisational authorship** — YMYL guidance favours a named person with
  verifiable credentials. Never invent a byline or a reviewer.

## 3. Refresh the plan

Rewrite `greek-cloud.com-audit/ACTION-PLAN.md`:

- move anything now done into the done table, with the evidence that it is done
- re-rank what remains by value against effort
- delete items that no longer apply, and say why rather than dropping them silently

Then reconcile it with `seo/backlog.md` so the two do not drift apart. The backlog
is the queue R4 pulls from; the action plan is the narrative. They must agree.

## 4. Health score

Produce a single score with its components, and compare against last month. The
score is only useful as a series, so record it in
`seo/state/health-score.json` with the date and the component breakdown.

## 5. Refresh the drift baseline

R1 compares against `seo/state/drift/`. After a month of accepted changes the
baseline drifts from reality. Recapture it, and note in the report how many pages
changed since the last baseline — a large number here means R1 has been reporting
changes nobody has been reading.

## 6. Output

`seo/reports/YYYY-MM-DD-audit.md` and a PR with the refreshed action plan, the
backlog reconciliation and the new baseline. Branch: `seo/r6-YYYY-MM-DD`.

Lead the report with the three things most worth doing this month. A list of
forty findings nobody reads is a failed audit.
