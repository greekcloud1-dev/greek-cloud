# Action plan — greek-cloud.com

Updated 18 September 2026. Everything in the previous plan is either done or
restated below with what actually changed.

## Done in this pass

| | what | evidence |
|---|---|---|
| 1 | Eight near-duplicate city pages deduplicated and given place-specific tables and FAQs | shared prose 52–58% → 30–38% |
| 2 | English city pages brought to parity | 525–590 → 814–906 words |
| 3 | Fonts self-hosted, three stylesheets merged, LCP faces preloaded | render block 1730ms → ~30ms; LCP mobile 3.26s → 2.0s; CLS 0.055 → 0.003 |
| 4 | Full legal entity published in homepage schema; every Article linked to it | Organization fields 5 → 14; 44/44 Articles gained `image` |
| 5 | Accessibility statements published, stale claim removed, contact route added | both now indexable, in sitemap and llms.txt |
| 6 | Trailing-slash duplicates redirected | `/athens.html/` 200 → 308 |
| 7 | `llms.txt` completed | 42 → 57 of 57 indexable pages |
| 8 | Heading-level skip closed on all 61 pages | footer `h4` → `h3` |
| 9 | `twitter:card` added to 34 pages; 7 meta descriptions trimmed under 160 | on-page audit clean |
| 10 | Em-dash density cut | 11.95 → 4.95 per 1000 words |
| 11 | Sitemap submitted to Search Console; 57 URLs to IndexNow | GSC status Success, 57 discovered; IndexNow HTTP 202 |

## Phase 1 — the trust gap (highest remaining value)

12. **Collect and publish reviews.** The site has none and the schema has no
    `Review` or `AggregateRating`. medtouristgr.com shows 21 Trustpilot reviews.
    On a YMYL service where a stranger hands over a passport number and a health
    description, this is the widest gap between the two sites and the cheapest to
    close. Ask past customers; publish what they say; mark it up.

13. **Decide the authorship question.** Every content page is authored by the
    organisation. Google's YMYL guidance favours a named person with verifiable
    credentials. Either name the person who researches and writes this material,
    with their background, or add a named medical or legal reviewer who has
    actually reviewed it. Do not invent one; an unnamed but honest page beats a
    fabricated byline.

14. **Fill `sameAs`** once the Instagram, Facebook and TikTok accounts exist.

## Phase 2 — content depth

15. **Give the eight city pages something first-hand.** They now carry genuine
    local facts, but nothing that could only be written by someone who had been
    there. A photograph of an actual pharmacy front, a named street, the real
    duty-rota board — any of these separates the page from a template.

16. **Translate the four strongest Hebrew-only pages.** `legal-updates.html` is
    the most citable page on the site and has no English version;
    `israeli-license-abroad.html`, `israeli-license-refused.html` and
    `glossary.html` are also Hebrew-only. See `findings/geo.md`.

17. **Turn four prose pages into tables.** `cannabis-in-greece`,
    `penalties-greece`, `eligibility` and `fly-with-cannabis` each state in
    paragraphs exactly the data an assistant would rather cite from a table.

18. **A human editing pass on structure.** The vocabulary is clean; the habits are
    not. Repeated binary contrasts at paragraph ends, and four consecutive
    headings in the same negation shape on `remote-prescription.html`. Listed per
    file with line numbers in `findings/content.md`.

## Phase 3 — measurement

19. **Check Search Console in a week.** Performance data was still processing on
    18 September. Watch: how many of the 57 URLs get indexed, which queries
    surface, and whether any city page is flagged as a duplicate despite the
    dedup.

20. **Set up Bing Webmaster Tools.** The IndexNow key is deployed and submissions
    are being accepted, but there is no console to read the results in.

21. **Take a drift baseline** so the next deploy can be diffed against today.

## Phase 4 — legal and operational loose ends

22. Confirm whether the database is registered with the Israeli Database
    Registrar, and state it either way.
23. Commission a certified accessibility-expert review and manual screen-reader
    testing; both are currently declared as open limitations on the statement.
24. Name the payment processor and a refund turnaround in business days on
    `refund.html`, which currently relies on the statutory period.
