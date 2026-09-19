# R5 · Competitors and AI answer engines

Weekly, Thursday 09:00 Asia/Jerusalem.

Two questions: is the competitor moving, and does this site get cited when an AI
assistant answers the question it exists to answer.

---

## 1. The competitor that matters

**medtouristgr.com.** Same business model, same "independent Greek physician plus
refund if declined" framing, already localised for Israelis at
`/he/medical-cannabis-greece`, prices around €22/€31/€39, and it currently owns
the AI-citation territory for this niche.

Fetch its sitemap and compare against `seo/state/competitors/medtouristgr.json`:

- new URLs since last week, with their titles — what are they publishing?
- pages that disappeared
- any change to the Hebrew-facing pages specifically
- price changes, if visible

Write the new snapshot back to the same file.

### canaflight.com — takedown watch

It went dark on 2026-09-17: every URL now answers 200 with a "לא זמין"
placeholder and `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`, while
robots.txt deliberately keeps crawling open so that header can be read. That is a
competent noindex removal, not a broken site.

Run it:

```
npm run check:canaflight
```

It compares the live domain against `seo/state/competitors/canaflight.json` and
exits non-zero when something moved. Two findings are material and belong in the
**first line** of the report:

- **real content is served again** — the site is back, and it is a competitor
  again at 169/249/349 against this site's 289/379
- **the noindex header is gone** — they intend to be indexed again, usually
  days before the content returns

The other signals (sitemap count, root title, a blanket `Disallow`) are worth a
line in the table, not an alarm. Commit the refreshed snapshot with
`npm run check:canaflight -- --save` as part of the R5 PR.

**What the script cannot answer is whether it ranks.** That needs a search API
this repo has no credential for, and a scraped SERP is worse than no answer — so
keep answering it the way the rest of this runbook does, by looking. Before the
takedown it ranked for no Hebrew head term, not even its own brand name.

Its registration runs to July 2027, and its own robots.txt frames the state as
*temporary* ("once the site is back"). So: do not treat it as the incumbent, and
do not build strategy around it staying down either. The watch exists precisely
because the owner's stated intent is to return.

## 2. AI answer-engine visibility

This is what `llms.txt` and the open `robots.txt` were built for, and nobody has
measured whether it works.

For each head term in `seo/config.json` (`headTerms.he` and `headTerms.en`), and
for these natural-language questions:

- "איך מקבלים מרשם קנאביס רפואי ביוון"
- "האם רישיון קנאביס ישראלי תקף ביוון"
- "how does an Israeli tourist get a medical cannabis prescription in Greece"

search and record: is greek-cloud.com cited or linked? Which domains are? Is
medtouristgr.com among them?

Use `seo-geo` to assess passage-level citability on the pages that *should* be
cited but are not — usually a page states in prose what an assistant would rather
quote from a table or a direct answer sentence.

Track the count in `seo/state/competitors/ai-visibility.json` over time. The trend
matters far more than any single week's result; these surfaces are noisy and a
one-week change is not a signal.

## 3. Search-intent fit

Use `seo-sxo` on one page per run, rotating through the site. The question it
answers: does the page type match what the SERP rewards for its target query? A
well-optimised page that is the wrong *kind* of page will not rank however clean
its markup is.

## 4. Output

`seo/reports/YYYY-MM-DD-competitive.md`, and a PR containing it plus the updated
state files. Branch: `seo/r5-YYYY-MM-DD`.

Append concrete opportunities to **Discovered** in `seo/backlog.md`, dated and
marked `R5`. Change no page content in this routine — this one observes.

If the competitor published something that materially changes the picture, say so
in the first line of the report rather than burying it in a table.
