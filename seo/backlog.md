# SEO backlog

The content queue the weekly content routine (R4) pulls from. One item per PR.
Seeded on 2026-09-18 from `greek-cloud.com-audit/ACTION-PLAN.md`. Routines append
to **Discovered** and never reorder the human-set priorities above it.

Status: `todo` / `in-pr` / `done` / `blocked`

---

## Trust signals — highest value, blocked on the owner

These cannot be automated. They need the owner, not an agent.

| # | Item | Status | Note |
|---|---|---|---|
| T1 | Collect and publish customer reviews, mark up with `Review` / `AggregateRating` | blocked | The site has none and the schema has no review nodes. medtouristgr.com shows 21 Trustpilot reviews. On a YMYL service where a stranger hands over a passport number, this is the widest gap between the two sites and the cheapest to close. **Needs the owner to ask past customers.** |
| T2 | Decide the authorship question | blocked | Every content page is authored by the organisation. Google's YMYL guidance favours a named person with verifiable credentials. Either name the researcher/writer with their background, or add a named medical or legal reviewer who has actually reviewed the material. **Do not invent one** — an unnamed but honest page beats a fabricated byline. |
| T3 | Fill `sameAs` in the Organization schema | blocked | Needs the Instagram, Facebook and TikTok accounts to exist first. |

---

## Translation — the four strongest Hebrew-only pages

| # | Item | Status | Note |
|---|---|---|---|
| C1 | `legal-updates.html` → `en/legal-updates.html` | todo | The most citable page on the site and it has no English version. Dated changelog with sources — exactly the shape AI answer engines quote. Highest-value single item an agent can do unaided. |
| C2 | `israeli-license-abroad.html` → EN | todo | Carries the rebuttal of the sponsored "Israelis can fly to Greece with cannabis" story. Must follow CLAUDE.md §1.2 and §1.3 exactly. |
| C3 | `israeli-license-refused.html` → EN | todo | Nohal 106 refusal grounds. |
| C4 | `glossary.html` → EN | todo | `DefinedTermSet` markup carries over; terms need real translation, not transliteration. |

After each one lands: add the hreflang pair on both sides, run `npm run check`,
regenerate the sitemap, add the entry to `llms.txt` by hand (its descriptions are
written, not derived), and submit to IndexNow.

---

## Structure — prose that should be tables

Each of these states in paragraphs exactly the data an assistant would rather cite
from a table. Converting them is a citability win, not a rewrite.

| # | Page | Status |
|---|---|---|
| S1 | `cannabis-in-greece.html` | todo |
| S2 | `penalties-greece.html` | todo |
| S3 | `eligibility.html` | todo |
| S4 | `fly-with-cannabis.html` | todo |

Mirror every change into the English twin in the same PR, and re-run
`npm run check:dup` afterwards — new tables are excluded from the overlap metric
but the surrounding prose is not.

---

## Depth — needs something first-hand

| # | Item | Status | Note |
|---|---|---|---|
| D1 | Give the city pages something only a visitor could write | blocked | They carry genuine local facts but nothing first-hand. A photograph of an actual pharmacy front, a named street, the real duty-rota board. **An agent cannot invent this** — inventing it is exactly the scaled-content pattern the dedup was fixing. Needs the owner or a real visit. |
| D2 | Per-page OG images | todo | Two static images serve 63 pages. `seo-image-gen` can generate per-page previews. Mechanical, safe, measurable CTR win. |
| D3 | An editing pass on sentence habits | todo | Repeated binary contrasts at paragraph ends; four consecutive headings in the same negation shape on `remote-prescription.html`. Listed per file with line numbers in `greek-cloud.com-audit/findings/content.md`. Use `stop-slop`. |

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
