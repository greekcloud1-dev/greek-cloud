# GreekCloud — Full SEO Audit

**Site:** https://greek-cloud.com
**Audited:** 2026-09-14 (day of launch on the new apex domain)
**Scope:** 53 sitemap URLs crawled live, all HTTP 200 · 61 HTML pages on disk
**Business type:** YMYL health + legal service (medical-cannabis prescription coordination for visitors to Greece), bilingual Hebrew (root, RTL) / English (`/en/`)

## SEO Health Score: 83 / 100

| Category | Weight | Score |
|---|---|---|
| Technical SEO | 22% | 95 |
| Content Quality | 23% | **55** |
| On-Page SEO | 20% | 98 |
| Schema / Structured Data | 10% | 85 |
| Performance (CWV) | 10% | 82 |
| AI Search Readiness | 10% | 88 |
| Images | 5% | 88 |

The score is held down almost entirely by one category. The engineering is excellent; what is
unfinished is **trust and identity**, and on a YMYL site that is the category that matters most.

---

## Critical

### C1 — Six live, indexable pages carry internal "to complete before publishing" blocks

`privacy.html`, `refund.html`, `terms.html` and all three English counterparts are
`index, follow` and publicly display an editorial to-do list. Verified live:

```
GET /en/refund.html  →  "To complete before publishing:
                          Dedicated email address for cancellation and refund requests
                          Actual refund turnaround (business days) and the name of the payment processor"
```

The same six pages also carry a visible banner reading *"המסמך טרם עבר בדיקה משפטית"* — this
document has not had legal review — whose own text says *"before publishing"*. They were published.

### C2 — The refund policy instructs users to write to an address that does not exist

`refund.html` says to send cancellation requests *"in writing to the address set out below"*.
There is no address below; there is the to-do block from C1. As published, the stated refund
mechanism cannot be used.

### C3 — No identified legal entity and no contact method anywhere on the indexable site

A site-wide search returns **zero** email addresses, **zero** telephone numbers and no postal
address. `Organization` schema publishes only `name` and `url` — no `legalName`, `taxID`,
`address`, `contactPoint` or `sameAs`. `about.html` holds all of that but is `noindex` because
its 16 placeholders are unfilled.

For YMYL commerce this is the single largest ranking liability: Google's quality guidelines treat
missing ownership and contact information on a money-or-life site as a strong low-quality signal.
It is also likely an Israeli consumer-law requirement for a trader taking payment.

---

## High

### H1 — `fetchpriority="high"` is set on an image that is not the LCP element

Measured on the live homepage: the LCP element is the **`<h1>` text** at 2008 ms. The
`fetchpriority="high"` attribute sits on `logo-lg.webp` — a 104.8 KB decorative image that is not
LCP — so high priority is being spent competing with the CSS and fonts that actually gate the
largest paint.

### H2 — WITHDRAWN on verification

I originally flagged the logos as badly oversized. Checking properly with Pillow, that was wrong
and I am correcting it rather than leaving it to look thorough:

- `logo-lg.webp` is 640x640 rendering into a 400x400 slot. That is **1.6x — correct for 2x
  retina**, not oversized. It would need to be 800px to be ideal.
- `logo.webp` at 224px serves a 95px slot (2.4x, appropriate) and a 70px slot (3.2x, marginal).
- Both are already near-optimally compressed: re-encoding at a safe quality saves only 3-6%,
  and lossless would nearly double them.

The genuine part of the original finding was the `fetchpriority` misconfiguration (H1), which was
real, measured, and is now fixed.

## Medium

### M1 — Static assets cannot be cached long because filenames carry no content hash

`base.css`, `settings.css`, `a11y-widget.css`, `home.css` and the JS files are served with
`max-age=3600`. With 61 pages loading the same four stylesheets, content-hashed filenames would
allow `max-age=31536000, immutable`.

### M2 — Five render-blocking stylesheets in the head

Four local files plus the Google Fonts request. `display=swap` is correctly set. FCP measured
2008 ms, just above the 1.8 s "good" threshold.

### M3 — `accessibility.html` is `noindex`

Israeli law (IS 5568) requires an accessibility statement to be published. It is linked in the
footer and reachable, but excluding it from search is a questionable choice for a document whose
purpose is to be findable.

---

## What is working — and working well

**Technical (95).** All 53 sitemap URLs return 200. Zero canonical errors; every page
self-canonicalises to the correct apex host. Zero hreflang errors across 26 HE/EN pairs — all
reciprocal, all with `x-default`. No orphan pages. Correct `lang`/`dir` on every page. Full
security header set: CSP, HSTS, COOP, CORP, X-Frame-Options, X-Content-Type-Options,
Referrer-Policy, Permissions-Policy. Brotli on HTML and CSS. Proper 404.

**Domain migration.** Complete and clean — 976 references to `greek-cloud.com`, **zero** remaining
references to the old domain anywhere in HTML, sitemap, llms.txt or config.

**On-page (98).** Zero issues across 53 pages: no missing or over-length titles, no missing or
mis-sized descriptions, no duplicate titles or descriptions, exactly one `<h1>` per page, no
heading-level skips.

**Content (writing quality).** Zero filler and zero AI-writing patterns detected on every page
sampled. Word count median 944, minimum 465 — no thin content. Quality scores 77–95.

**Schema (85).** 16 types in use, valid JSON-LD on every page, zero parse errors. FAQPage on 45 of
61 pages with 230 answers, and every answer matches its visible copy exactly.

**AI readiness (88).** `llms.txt` live and fully migrated. GPTBot, ClaudeBot, PerplexityBot and
Google-Extended explicitly allowed. **97 outbound citations across 21 authority domains** — EOF
(29), gov.il (19), Greek Ministry of Health (11), EUDA, Israeli embassies, `e-nomothesia.gr`.
FAQ answers median 182 chars: good passage-level citability length.

**Core Web Vitals.** CLS **0**. TTFB 311 ms. LCP 2008 ms (within "good"). 11 requests, 161.7 KB.

---

## Out of scope for this audit

This audit covers SEO health, not factual accuracy. Four content-accuracy domains remain
unexamined — Greek criminal law, pricing/pharmacy operations, CBD/hemp thresholds, and
schema-vs-body claims — plus 19 lower-confidence findings deferred from earlier waves. Two major
factual errors were found and corrected in this codebase in the preceding days, so that axis
should not be assumed clean.
