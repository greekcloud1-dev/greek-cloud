# R1 · Daily health and drift

Daily, 06:00 Asia/Jerusalem, Sunday–Thursday.

The job is to notice within a day that something broke, rather than within a
month. Most days this finds nothing and that is the expected outcome — say so in
one line and stop. Do not manufacture findings to look useful.

---

## 1. Run the checks

Dependency-free Node scripts. **Do not run `npm install`.**

```
node scripts/check-seo.mjs
node scripts/check-duplication.mjs
node scripts/check-duplication.mjs --en
node scripts/build-sitemap.mjs --dry-run
```

Keep the exact output of each. `check-seo.mjs` exits non-zero on any error;
`build-sitemap.mjs --dry-run` prints a diff if `sitemap.xml` has gone stale.

## 2. Guard the live site

Fetch and verify:

| URL | Must be true |
|---|---|
| `https://greek-cloud.com/` | 200 |
| `https://greek-cloud.com/athens.html` | 200, and **no** `X-Robots-Tag: noindex` response header |
| `https://greek-cloud.com/robots.txt` | 200, still allows `GPTBot`, `ClaudeBot`, `PerplexityBot`, `OAI-SearchBot`, `Google-Extended`, still points at the sitemap |
| `https://greek-cloud.com/sitemap.xml` | 200 |
| `https://greek-cloud.com/657aba77224ced8ed594032ef5f33f71.txt` | 200 — the IndexNow key |

A sitewide `noindex`, or a `robots.txt` that has lost the AI-crawler allowances,
is the most serious thing you can find. `noindex` is meant to be scoped to
`/api/*` only. Lead the report with it, and stop the rest of the run to report it
immediately.

## 3. Drift

Use the `seo-drift` skill.

- If `seo/state/drift/` is empty, this is the first run: **capture a baseline**
  for every indexable page and commit it. Say so and finish — there is nothing to
  compare against yet.
- Otherwise compare today against the baseline. Report changes to titles, meta
  descriptions, canonicals, hreflang, H1s, and JSON-LD node counts.

Classify each change:

- **regression** — something got worse, or a page lost an element it had
- **intentional** — it matches a commit in `git log --since="2 days ago"`
- **unexplained** — it matches no commit. These matter most. Name the page, the
  element, the old value and the new one.

Refresh the baseline only for changes you classified as intentional.

## 4. What to do with what you found

| Situation | Action |
|---|---|
| Everything passes | Write a one-line report. Open no PR. |
| Mechanical and unambiguous (stale `sitemap.xml`, a broken internal link with an obvious target, a description over 160 characters) | Fix it, re-run the checks, open a PR. |
| Anything touching wording, legal claims or page structure | **Do not edit.** Describe it in the report and add it to `seo/backlog.md` under **Discovered** with today's date and `R1`. |
| Live-site guard failed | Open no PR. Report it as urgent, with the exact URL, status code and headers. |

## 5. Output

Write `seo/reports/YYYY-MM-DD-health.md`:

- one-line verdict: `clean` or `N finding(s)`
- the check output, verbatim
- the live-site table with actual status codes
- drift findings grouped as regression / intentional / unexplained
- what you changed, if anything, and what you deliberately left alone

If you opened a PR, title it `R1: <the single most important finding>` and put
the verdict line and the reasoning in the body. Branch name: `seo/r1-YYYY-MM-DD`.
