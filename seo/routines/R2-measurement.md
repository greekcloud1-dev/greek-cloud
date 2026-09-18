# R2 · Measurement and indexation

Weekly, Sunday 07:00 Asia/Jerusalem.

This site carries **no analytics on purpose** — the CSP blocks third-party
connections and `assets/notice.js` promises visitors there are none. Search
Console is therefore the only source of truth about how the site actually
performs, and this routine is the entire measurement loop.

---

## 0. Credentials — check before anything else

Needs a Google service account with access to the Search Console property
`sc-domain:greek-cloud.com`, exposed as `GOOGLE_SERVICE_ACCOUNT_JSON`, and
optionally `BING_WEBMASTER_API_KEY`.

**If the credential is absent, stop.** Write a report saying exactly which
variable is missing and that no measurement was possible. Do not guess at
numbers, do not substitute a web search for API data, and do not open a PR.
A run that reports "no data available" is correct; a run that invents plausible
figures is worse than no run at all.

## 1. Search Console

For the last 7 days, and the 7 days before that for comparison:

1. **Queries** — top 50 by impressions, with clicks, CTR and average position.
2. **Pages** — every URL with impressions, clicks and average position.
3. **Indexation** — URL Inspection across all URLs in `sitemap.xml`. Record which
   are indexed, which are "Discovered – currently not indexed", which are
   "Crawled – currently not indexed", and any flagged as a duplicate with a
   different canonical.
4. **Sitemap status** — last read date, URLs discovered, errors.

## 2. Bing

If `BING_WEBMASTER_API_KEY` is set: indexed count, crawl errors, and whether the
IndexNow submissions were accepted. Bing feeds Microsoft Copilot citations, which
is the only reason to care about it here.

## 3. Compare and flag

Write `seo/state/gsc/YYYY-MM-DD.json` with the raw figures, and update
`seo/state/keywords.json` mapping query → page → position → change since last
week.

Flag, in this order of importance:

- a page in `sitemap.xml` that is **still not indexed** more than 14 days after it
  first appeared there
- a city page flagged as a **duplicate with a different canonical** — this would
  mean the 2026-09-18 deduplication did not fully take, and it is the single most
  consequential thing this routine can detect
- a query that **entered or left the top 10**
- a page whose average position **dropped by 3 or more**
- impressions down more than 30% week on week, sitewide

Read the head terms from `seo/config.json` (`headTerms.he` and `headTerms.en`) and
report position for each explicitly, whether or not it moved. The strategic bet is
that the Hebrew transactional layer is empty; these numbers are how you find out
whether that is still true.

## 4. Feed the content pipeline

Append to **Discovered** in `seo/backlog.md`, dated, marked `R2`:

- queries with impressions but position 11–20 — a page that nearly ranks is worth
  more than a new page
- queries the site gets impressions for with **no page that targets them**
- pages with impressions but a CTR far below the others at similar position —
  usually a title or description problem, which is cheap to fix

## 5. Output

Write `seo/reports/YYYY-MM-DD-performance.md`. Lead with what changed, not with a
table dump. Open a PR containing the report, the state files and any backlog
additions. Branch: `seo/r2-YYYY-MM-DD`. Change no page content in this routine.
