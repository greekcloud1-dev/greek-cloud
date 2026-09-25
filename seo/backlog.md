# SEO backlog

The content queue the weekly content routine (R4) pulls from. One item per PR.
Seeded on 2026-09-18 from `greek-cloud.com-audit/ACTION-PLAN.md`. Routines append
to **Discovered** and never reorder the human-set priorities above it.

Status: `todo` / `in-pr` / `done` / `blocked`

## Audience (set by the owner, 2026-09-19)

**The primary market is Israeli.** Hebrew pages are the product; the English side
is secondary. When two items are otherwise equal in value, the Hebrew-side item
wins. Do not promote an English translation over Hebrew work on the argument that
it "unlocks a new market" — that decision has been made and is not an agent's to
revisit.

**The service has served real customers and the pipeline works end to end**
(owner, 2026-09-19). Reviews and named testimonials are actionable. First-hand
city-page detail and a credentialed named author are still genuinely absent and
must never be invented.

---

## Trust signals — highest value, blocked on the owner

These cannot be automated. They need the owner, not an agent.

| # | Item | Status | Note |
|---|---|---|---|
| T1 | Collect and publish customer reviews, mark up with `Review` / `AggregateRating` | **todo — owner action, highest value on the site** | There are past customers to ask. medtouristgr.com showed 21 Trustpilot reviews on 2026-09-18 and 28 at 4.7 on 2026-09-19 — the gap widens while this waits. For an Israeli audience the higher-value form is a named first-person account on the site itself; Trustpilot needs no address and is worth opening in parallel, though Israelis rarely search it. Ask customers to leave medical detail out. An agent may build the page and the schema, but **only from text a real customer actually wrote** — never drafted, paraphrased or composited. |
| T2 | Decide the authorship question | blocked | Every content page is authored by the organisation. Google's YMYL guidance favours a named person with verifiable credentials. Either name the researcher/writer with their background, or add a named medical or legal reviewer who has actually reviewed the material. **Do not invent one** — an unnamed but honest page beats a fabricated byline. |
| T3 | Fill `sameAs` in the Organization schema | blocked | Needs the Instagram, Facebook and TikTok accounts to exist first. |
| T4 | Google Business Profile | blocked | **Not eligible and should not be attempted.** Google's requirement is in-person contact with customers during stated hours; this service has none — the prescription is remote and dispensing happens at a Greek pharmacy that is not the business's. Virtual offices, mailbox addresses and home addresses customers never visit are explicitly prohibited, and a suspension on a YMYL medical listing is hard to undo. Do not propose workarounds. |

---

## Structure — prose that should be tables

Hebrew pages, the primary market. Each of these states in paragraphs exactly the
data an assistant would rather cite from a table. Converting them is a citability
win, not a rewrite.

| # | Page | Status |
|---|---|---|
| S1 | `cannabis-in-greece.html` | done (2026-09-24) |
| S2 | `penalties-greece.html` | done (2026-09-24) |
| S3 | `eligibility.html` | done (2026-09-24) |
| S4 | `fly-with-cannabis.html` | done (2026-09-24) |

Mirror every change into the English twin in the same PR, and re-run
`npm run check:dup` afterwards — new tables are excluded from the overlap metric
but the surrounding prose is not.

---

## Depth

| # | Item | Status | Note |
|---|---|---|---|
| D2 | Per-page OG images | todo | Two static images serve 63 pages. `seo-image-gen` can generate per-page previews. Mechanical, safe, measurable CTR win. Do the Hebrew pages first. |
| D3 | An editing pass on sentence habits | todo | Repeated binary contrasts at paragraph ends; four consecutive headings in the same negation shape on `remote-prescription.html`. Listed per file with line numbers in `greek-cloud.com-audit/findings/content.md`. Use `stop-slop`. |
| D1 | Give the city pages something only a visitor could write | blocked | They carry genuine local facts but nothing first-hand. A photograph of an actual pharmacy front, a named street, the real duty-rota board. **An agent cannot invent this** — inventing it is exactly the scaled-content pattern the dedup was fixing. Needs the owner or a real visit. |

---

## Translation — secondary, see Audience above

Deprioritised on 2026-09-19: the primary market is Israeli. These stay in the
queue because the pages are genuinely strong, but an agent takes them only when
the Hebrew-side items above are exhausted or blocked.

| # | Item | Status | Note |
|---|---|---|---|
| C1 | `legal-updates.html` → `en/legal-updates.html` | todo | Dated changelog with sources — the shape AI answer engines quote. Was the top unblocked item until the audience was set. |
| C2 | `israeli-license-abroad.html` → EN | todo | Carries the rebuttal of the sponsored "Israelis can fly to Greece with cannabis" story. Must follow CLAUDE.md §1.2 and §1.3 exactly. |
| C3 | `israeli-license-refused.html` → EN | todo | Nohal 106 refusal grounds. |
| C4 | `glossary.html` → EN | todo | `DefinedTermSet` markup carries over; terms need real translation, not transliteration. |

After each one lands: add the hreflang pair on both sides, run `npm run check`,
regenerate the sitemap, add the entry to `llms.txt` by hand (its descriptions are
written, not derived), and submit to IndexNow.

---

## Measurement — was Phase 3, now the R1/R2 routines

| # | Item | Status | Note |
|---|---|---|---|
| M1 | Watch indexation of the 57 URLs in Search Console | todo | Now R2's standing job rather than a one-off reminder. Blocked until the service account is connected. |
| M2 | Set up Bing Webmaster Tools | todo | The IndexNow key is deployed and submissions are accepted, but there is no console to read the results in. |
| M3 | Take a drift baseline | todo | R1's first run does this. |

---

## Legal and operational

| # | Item | Status | Note |
|---|---|---|---|
| L1 | Confirm whether the database is registered with the Israeli Database Registrar, and state it either way | blocked | Owner. |
| L2 | Commission a certified accessibility review and manual screen-reader testing | blocked | Owner. Both are currently declared as open limitations on the statement. |
| L3 | Name the payment processor and a refund turnaround in business days on `refund.html` | blocked | Owner. Currently relies on the statutory period. |

---

## Discovered

Routines append here with the date and which routine found it. Nothing is added
above this line automatically.

<!-- R2/R4/R5 append below -->

### 2026-09-24 — R5

| # | Item | Note |
|---|---|---|
| R5-1 | greek-cloud.com was cited in 0 of 15 AI-answer-engine checks this week (8 Hebrew head terms, 4 English head terms, 3 natural-language questions); medtouristgr.com was cited in 5, all English-side. The Hebrew transactional query space is confirmed empty, not just inferred: Hebrew results for these terms are Israeli health-fund domestic-licence pages and Israeli travel-with-a-licence-abroad guides, not Greek-prescription content from any competitor. `guide.html` was checked with `seo-sxo` and its page type (process guide + FAQ + cost table) already matches what an answer engine would want to quote — the gap is citation/indexation, not content shape. See `seo/reports/2026-09-24-competitive.md` §3–4 and `seo/state/competitors/ai-visibility.json`. No action prescribed here beyond tracking the trend for a few more weeks before concluding anything — one week is noise. |
| R5-2 | medtouristgr.com added eight `/greece-travel-guide-<country>` pages (incl. `-israel`) and ten `<city>-travel-guide` pages since the last dated reference in CLAUDE.md §7, widening its funnel from pure "medical cannabis Greece" queries into general Greece-travel-planning queries with the cannabis pitch embedded. Possible future angle: this site's eleven city pages are prescription-process framed, not travel-planning framed — worth watching whether medtouristgr's broader top-of-funnel starts pulling Hebrew travel-intent traffic, but not proposing a page type change on one week's observation. See `seo/reports/2026-09-24-competitive.md` §1 and `seo/state/competitors/medtouristgr.json`. |
