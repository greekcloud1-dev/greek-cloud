# Action Plan — greek-cloud.com

Ordered by what costs you rankings and trust soonest.

## Phase 1 — Critical (do before Google recrawls)

1. **Remove the "to complete before publishing" blocks from the six live legal pages**
   `privacy.html`, `refund.html`, `terms.html` + `/en/` counterparts. Either finish them or set
   the three to `noindex` until they are finished. Right now an internal to-do list is public.
2. **Decide the legal-review banner.** Same six pages say the document has not been reviewed and
   should be reviewed *"before publishing"*. Either the review happened (remove the banner) or it
   did not (noindex the pages).
3. **Publish a contact method and a legal entity.** Fill the 16 placeholders in `about.html`,
   remove its `noindex`, and add `legalName`, `taxID`, `address`, `contactPoint` and `sameAs` to
   the `Organization` schema. This is the single biggest E-E-A-T lever on the site.
4. **Give the refund policy a working address** — it currently points to one that does not exist.

Items 1–2 and 4 are edits I can make. Item 3 needs entity details only you have.

## Phase 2 — High impact (week 1)

5. **Move `fetchpriority="high"` off `logo-lg.webp`.** The LCP element is the `<h1>`; the
   attribute is currently helping a decorative image compete with the CSS that gates LCP.
6. **Resize the logos.** 224px serving a 70px slot, 640px serving 400px. Export at the rendered
   sizes (2× for retina) and add `width`/`height` + `srcset`. Recovers most of 125 KB.

## Phase 3 — Optimisation (weeks 2–3)

7. **Content-hash the asset filenames** (`base.a1b2c3.css`) and raise cache to
   `max-age=31536000, immutable`. Currently one hour across 61 pages.
8. **Reduce render-blocking CSS** — four local stylesheets could be concatenated, or critical CSS
   inlined.
9. **Reconsider `noindex` on `accessibility.html`** — Israeli IS 5568 expects it to be published.

## Phase 4 — Ongoing

10. **Finish the four unaudited content-accuracy domains** — Greek criminal law, pricing/pharmacy
    operations, CBD/hemp thresholds, schema-vs-body — plus the 19 deferred low-confidence findings.
    This is a different axis from SEO health and two major factual errors were already found.
11. **Register the site in Google Search Console and Bing Webmaster Tools.** No Google credentials
    are configured, so this audit has no field data — no CrUX, no indexation status, no queries.
12. **Take a drift baseline** so future deploys can be diffed against today's state.
