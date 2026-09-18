# GreekCloud — SEO and GEO audit

**Site:** https://greek-cloud.com
**Audited and fixed:** 18 September 2026
**Scope:** 61 HTML pages on disk, 57 indexable, all crawled live · bilingual Hebrew (root, RTL) / English (`/en/`)
**Business type:** YMYL health + legal service — medical-cannabis prescription coordination for travellers to Greece
**Supersedes:** the 14 September audit in this directory, which scored 83/100

Every finding below was verified against the live site or the files on disk, and
every one marked **fixed** was fixed and re-verified in the same session. Per-category
detail is in `findings/`.

---

## What was actually wrong

### C1 — Eight city pages were near-duplicates of each other · FIXED

This was the real indexing risk, and it was not the writing style.

Measured on the Hebrew destination pages before the fix: **28 sentences appeared
verbatim on six or more of the eleven pages**, and 52–58% of the sentences on eight
of them also appeared on a sibling. The single worst block was the "opening hours"
explainer — roughly 180 words of national Greek pharmacy rules restated in full on
every city page, while `pharmacies-greece.html` already exists to own exactly that
material. Two of the four FAQ entries were also word-for-word identical across eight
pages.

Only `lefkada`, `zakynthos` and `halkidiki` were genuinely differentiated (14–26%
shared), which is what made the pattern obvious: the template was fine, the eight
pages that had not been given real local substance were the problem.

This is the shape Google's scaled-content-abuse policy targets. It is not a rule
about AI; it is a rule about many pages that say the same thing.

**Fixed by** replacing the restated national rules with a one-line link to the page
that owns them, giving each city a summary table of its own facts (airport, where the
pharmacies actually are, the drive from the resort areas, what closes off season), and
replacing the two shared FAQ entries with place-specific ones drawn from facts already
established on that page.

Shared prose fell from 52–58% to 30–38%. What still repeats is a safety warning, a
CTA and navigation, which is ordinary site boilerplate.

### C2 — The English mirrors were thin · FIXED

The same eight pages in English ran 525–590 words and had no pharmacy section at
all — the practical half of the page simply did not exist in English. They now carry
the same table and practicalities plus two place-specific FAQ entries each, and run
801–895 words.

First pass introduced a second problem: the "process" paragraph pasted into all
eight pages was word-for-word identical, missing the per-city variation ("not only
in Athens", "not only in Crete"...) the Hebrew version had all along. That held
shared-sentence overlap at 34.1–38% — higher than the page lengths justified.
Fixed by inserting the same variation and folding two sentences into one; overlap
is now 31.7–35.1%, in the same range as the Hebrew pages.

### C3 — The accessibility statement was unpublished and carried a false claim · FIXED

`accessibility.html` and `en/accessibility.html` were `noindex` and displayed a banner
reading "draft — not for publication until the details are completed". They also listed,
as a known limitation, that the intake form is not connected to an intake system. That
had stopped being true: `/api/health` returns `configured: true`.

IS 5568 expects the statement to be findable. Both pages are now indexable, in the
sitemap, in `llms.txt`, carry the entity details and a real contact route, and state
plainly that an appointed coordinator is only required of a public body or an employer
of 25 or more rather than inventing a role. The stale limitation is gone; the two that
are still true (no certified-expert review, no manual screen-reader testing) stay.

### H1 — The Google Fonts request was most of the render block · FIXED

Measured on the live homepage before the fix: **972ms of a 1730ms render block on
mobile**, because the browser had to resolve and connect to `fonts.googleapis.com` and
`fonts.gstatic.com` before it even learned which font files it needed. Three more
stylesheets (`settings.css`, `a11y-widget.css`, `whatsapp-widget.css`) were each a
separate render-blocking request on all 61 pages.

CLS was **0.055**, not the 0 a previous audit reported — caused by seven webfonts
swapping in after first paint.

**Fixed by** self-hosting nine woff2 files (hebrew, latin, latin-ext; Assistant is one
variable file per subset, so its four weights share a file), preloading the two faces
that gate the `<h1>` — which is the LCP element, measured rather than assumed — and
merging the three universal stylesheets into `base.css` in their old cascade order.

| | before | after |
|---|---|---|
| render-blocking | 1730ms, 6 requests, 3 hosts | ~30ms, 2 requests, 1 host |
| font payload, Hebrew visitor | 87.5 KB third-party | 23.7 KB same-origin |
| third-party requests | 2 hosts | none |
| LCP mobile | 3.26s | **2.0s** |
| LCP desktop | 3.30s | **0.6s** |
| CLS | 0.055 | **0.003** |
| Lighthouse mobile performance | — | **99** |
| Lighthouse desktop performance | — | **100** |

### H2 — The homepage published almost no entity data · FIXED

`about.html` held the full legal entity while the homepage `Organization` block carried
only `name` and `url`. On a YMYL site that takes payment, published ownership and
contact detail is the largest single E-E-A-T lever.

Both homepages now carry `legalName`, `taxID`, `address`, `telephone`, `email` and
`contactPoint`, and every `Article` on the site points `author` and `publisher` at that
one `#org` node instead of a bare name. All 44 `Article` nodes gained the `image`
property they were missing.

**Still open:** `sameAs` has nothing to point at until the social accounts exist, and
the author of record is the organisation rather than a named person. On YMYL health
content a named, credentialed reviewer is worth real money in Google's eyes — but
inventing one would be worse than not having one. See the questions at the end.

### M1 — Trailing-slash URLs served duplicate content · FIXED

`https://greek-cloud.com/athens.html/` returned 200 with a byte-identical body, on all
61 pages, with no redirect. Now a 308 to the canonical URL.

One redirect had to be pulled before it shipped: a rule sending `/en` to `/en/` would
have looped the English homepage, because path-to-regexp — which Vercel compiles
redirect sources with — matches an optional trailing slash and Vercel does not expose
strict mode. Caught by testing every rule against path-to-regexp 6.2.1 rather than by
deploying it.

### M2 — `llms.txt` was missing 15 indexable pages · FIXED

It listed 42 of 57. Missing entirely: both accessibility statements, all three Hebrew
legal pages, all three English legal pages, and six English pages that exist with
correct canonical and hreflang (`eligibility`, `penalties-greece`, `pharmacies-greece`,
`pharmacy-prices`, `halkidiki`, `lefkada`). Now complete.

Worth saying plainly: **Google Search ignores `llms.txt`.** It matters for assistants
that read it, not for ranking.

### M3 — A heading-level skip on every page · FIXED

Footer column headings were `<h4>` following an `<h2>`, so all 61 pages skipped a
level. Promoted to `<h3>`, with the CSS selector moved to match.

### M4 — Smaller on-page gaps · FIXED

`twitter:card` was missing on 34 pages (present on the English content pages, absent on
the Hebrew ones — an inconsistency, not a policy). Seven meta descriptions ran 161–164
characters. Both fixed.

---

## The AI-writing question, answered honestly

The premise is worth correcting: **Google has not published a rule that penalises sites
for being built with AI.** Its position, unchanged since February 2023 and restated
through 2026, is that it judges the content, not the tool. What the March 2026 core
update did target is *scaled content abuse* — many pages that add nothing — and that is
a rule about value, not authorship. There is no em-dash detector.

So the honest split:

**The part that mattered** was C1, the eight near-duplicate city pages. That is exactly
the pattern the policy names, and it is fixed.

**The part that is editorial polish, not ranking:** the prose carried an em-dash density
of **11.95 per 1000 words**. Hebrew editorial writing normally runs 1–3. It was the
clearest stylistic fingerprint on the site, so it is now **4.95 per 1000** — a 59% cut,
made by turning each dash into the punctuation an editor would actually have used: a
comma before a conjunction, a colon before a list, a full stop between two independent
clauses. This buys no ranking. It buys prose that does not announce how it was drafted.

**What the vocabulary scan found:** almost nothing. Across roughly 65,000 words, four
hits for the classic tells, and two of those were legitimate quotations of statutory
wording. No "delve", no "seamless", no "in today's world", no Hebrew equivalents. The
writing was already specific and concrete. The structural habits flagged in
`findings/content.md` — repeated binary contrasts at paragraph ends, four consecutive
headings in the same negation shape — are real and worth a human editing pass, but they
are small.

---

## What is working

**Technical.** All 57 sitemap URLs return 200 to Googlebot with no `noindex`. Zero
canonical errors; every page self-canonicalises to the apex host. Zero hreflang errors
across the HE/EN pairs, all reciprocal, all with `x-default`, and the five Hebrew-only
pages correctly declare only `he` + `x-default` rather than a false English alternate.
`cleanUrls: false` is correct — `/athens` returns 404, so there is no extensionless
duplicate. www→apex and http→https both 308. Full security header set, now with a
tighter CSP because no third-party font host is needed.

**Internal linking.** Zero broken internal links across 61 pages. No orphans except the
two 404 pages, which is correct.

**Schema.** 16 types, valid JSON-LD on every page, zero parse errors. **246 FAQ pairs
checked against the visible copy after every edit in this session: zero mismatches** —
Google requires the answer text in FAQ structured data to appear in the rendered page,
and a mismatch risks a manual action.

**AI readiness.** GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and Google-Extended
are explicitly allowed and confirmed live — those user agents receive a byte-identical
200. The site is fully static, so there is no render gap. 97 outbound citations across
21 authority domains: EOF, gov.il, the Greek Ministry of Health, EUDA, `e-nomothesia.gr`.

**Core Web Vitals.** All three in the good band on mobile and desktop.

---

## Indexing status

The site was **not absent from Google's index** — the homepage was already indexed. What
was missing was the sitemap: Search Console showed **0 sitemaps submitted**, so Google
had no map of the other 56 URLs.

Done on 18 September 2026:

- `https://greek-cloud.com/sitemap.xml` submitted to Search Console — status **Success**,
  **57 pages discovered**.
- Recrawl requested for `/` and `/en/`, both accepted.
- All 57 URLs submitted to IndexNow (HTTP 202), which feeds Bing, Yandex, Seznam, Naver
  and Yep. Google does not participate; this matters because the Bing index is what
  feeds Microsoft Copilot citations.

Search Console's URL-inspection box stopped accepting input after a few runs, so
per-URL recrawl requests beyond `/` and `/en/` were not made. They are an accelerant,
not a requirement — the sitemap is how Google finds the rest, and manual requests are
quota-limited to roughly ten a day anyway.

Performance data in Search Console still reads "processing, check back in about a day",
so there is no query or impression data to report yet.

---

## Still open

1. **`sameAs` is empty** — no Instagram, Facebook or TikTok accounts exist yet. Cosmetic
   for now, real once they do.
2. **No named author or medical reviewer.** The strongest remaining E-E-A-T lever on a
   YMYL health site, and not something to fabricate.
3. **No reviews anywhere on the site**, and no `Review`/`AggregateRating` schema. The
   main competitor shows 21 Trustpilot reviews. This is the widest trust gap.
4. **Almost no real photography** — the site runs on illustration and type.
5. **No certified accessibility-expert review** and no manual screen-reader testing,
   both still declared as limitations on the statement.
6. **Registration with the Israeli Database Registrar** is not stated either way.
7. **The eight city pages are better but still templated.** Each now has genuine local
   facts; none has anything that could only have been written by someone who went there.
