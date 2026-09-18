# Routine runbooks

One file per scheduled cloud routine. The routine itself carries a three-line
prompt that says "read `CLAUDE.md`, then read this runbook, then follow it" —
everything else lives here, in the repository, so it is versioned, reviewable in
a PR, and editable without touching a cron schedule.

| Runbook | Cadence (Asia/Jerusalem) | Job |
|---|---|---|
| [R1](R1-health-drift.md) | daily 06:00, Sun–Thu | on-page checks, live-site guards, drift |
| [R2](R2-measurement.md) | Sunday 07:00 | Search Console and Bing — indexation and queries |
| [R3](R3-page-engine.md) | 1st of the month 10:00 | sitemap, hreflang, schema, city-page structure |
| [R4](R4-content.md) | Monday 08:00 | one content draft from `seo/backlog.md` |
| [R5](R5-competitors-geo.md) | Thursday 09:00 | medtouristgr.com and AI answer-engine visibility |
| [R6](R6-deep-audit.md) | 1st of the month 11:00 | full audit, Lighthouse, refresh the action plan |

## Rules every routine follows

1. **Read `CLAUDE.md` first, in full.** It governs legal claims on a YMYL site.
   Nothing in a runbook overrides it.
2. **Never push to `main`.** Work on a branch named `seo/<routine>-<date>` and
   open a pull request. If there is nothing to change, say so and open nothing —
   an empty PR is noise.
3. **`npm run check` and `npm run check:dup` must pass** before opening a PR.
   If a check fails, the content is wrong, not the check.
4. **Never invent a fact.** No review counts, no refusal rates, no first-hand
   detail about a place. If a task needs something only a human can supply, write
   it into `seo/backlog.md` as `blocked` and move on.
5. **Write findings to `seo/reports/YYYY-MM-DD-<routine>.md`** and keep durable
   state under `seo/state/`.
6. **Report honestly.** If a step could not run — a missing credential, a site
   that would not respond — say which step, and why, in the PR body. Never
   present a skipped check as a passed one.

## Schedule note

Cron runs in UTC. These are set for Israel Summer Time (UTC+3). When DST ends in
late October every routine lands an hour later in local time; that is harmless
for all six, but if it matters, shift each cron forward by one hour.

Nothing is scheduled for Friday or Saturday.
