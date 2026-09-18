# Technical SEO Audit — greek-cloud.com
Date: 2026-09-18. Live checks via curl/PSI against https://greek-cloud.com; local files at C:\kkk\greekcloud. CONFIRMED = verified live or by direct file read. SUSPECTED = inferred, not directly verified.

## Score: 90/100

Clean implementation overall. One CONFIRMED duplicate-URL defect (trailing-slash on static files), one CONFIRMED 2-hop redirect chain, one CONFIRMED CSP weakness (accepted risk, noted), PSI Lighthouse/CrUX lab data unavailable (rate-limited/no API key).

---

## 1. Sitemap (CONFIRMED)

`https://greek-cloud.com/sitemap.xml` — 200, valid `urlset`, declared correctly in `robots.txt` line `Sitemap: https://greek-cloud.com/sitemap.xml` (C:\kkk\greekcloud\robots.txt). `sitemap_discovery.py` validated it via the robots.txt declaration; no stale fallback needed.

- 55 `<loc>` entries, 0 duplicates (verified via `grep -c "<loc>"` + `sort | uniq -d`).
- Diffed against the local file tree: every sitemap URL corresponds 1:1 to a real HE (root, 33 files) or EN (`/en/`, 28 files) HTML file, minus the 6 known-noindex files (404, accessibility, intake × HE/EN) = 61 − 6 = 55. `comm -23`/`comm -13` between expected-from-disk and sitemap-URLs returned **zero** rows both directions — sitemap is exactly correct, no missing pages, no stale/extra entries.
- **All 55 sitemap URLs return live HTTP 200** (checked every URL with `curl -o /dev/null -w "%{http_code}"`). Zero 404s, zero redirects in the sitemap. No action needed here.

## 2. Canonical tags (CONFIRMED)

Fetched all 61 pages (55 sitemap + 6 noindex) live and extracted `<link rel="canonical">`.

- **59/59 indexable pages self-canonicalize correctly** — canonical href matches the request URL exactly, byte for byte, apex host, no `www`, no trailing-slash mismatch, `https` scheme.
- 404.html and en/404.html carry no canonical tag — expected/correct for a 404-status page, not a defect.
- Host consistency: all canonicals use `https://greek-cloud.com/...` (apex, no www) with zero exceptions.

## 3. Hreflang (CONFIRMED)

Extracted `<link rel="alternate" hreflang>` from all 61 live pages and cross-checked reciprocity programmatically.

- **Every HE/EN pair is fully reciprocal**: for all pages that declare `hreflang="en"`, the target EN page declares `hreflang="he"` back to the exact same HE URL. No orphaned or one-directional hreflang found.
- **x-default is present on every indexable page** and always points to the Hebrew URL (the HE version is the default/primary market) — consistent across all 53 indexable pages checked.
- Codes used are exactly `he`, `en`, `x-default` — no wrong/malformed codes.
- **The 5 Hebrew-only pages are handled correctly**: `glossary.html`, `legal-updates.html`, `israeli-license-abroad.html`, `israeli-license-refused.html`, `zakynthos.html` each declare **only** `hreflang="he"` + `hreflang="x-default"` (both pointing to themselves) — no false `hreflang="en"` claim to a page that doesn't exist. Verified live for all 5.
- noindex pages (`accessibility.html`, `intake.html`, HE+EN) still carry full he/en/x-default hreflang sets pointing at each other. Harmless since both sides are noindex, but technically inert — low priority, not worth changing.
- `404.html`/`en/404.html` have no hreflang tags — correct.

## 4. Indexability / noindex (CONFIRMED)

Live `<meta name="robots">` fetched for all 6 known-noindex targets:

| URL | robots meta | HTTP status |
|---|---|---|
| /404.html | `noindex, follow` | 200 (direct hit) / 404 (as fallback for unknown paths) |
| /en/404.html | `noindex, follow` | same pattern |
| /accessibility.html | `noindex, follow` | 200 |
| /en/accessibility.html | `noindex, follow` | 200 |
| /intake.html | `noindex, follow` | 200 |
| /en/intake.html | `noindex, follow` | 200 |

All 6 correctly excluded from sitemap.xml. Homepage and sampled inner pages carry `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">` — correct. `robots.txt` deliberately does **not** `Disallow` intake.html (documented inline in the file, lines 1–4: a Disallow would stop crawlers from reading the noindex tag) — correct reasoning, working as intended.

Unindexed-not-caught check: no other pages found carrying unexpected noindex — all 53 sitemap-listed indexable pages return `index, follow` (spot-checked homepage, en homepage, athens.html; consistent template, no per-page override found in grep of `*.html` for `noindex` outside the 6 known files).

## 5. Duplicate-content / URL structure — the cleanUrls:false question (CONFIRMED)

`vercel.json` (C:\kkk\greekcloud\vercel.json) sets `"cleanUrls": false` and has only two redirect rules (`/index.html → /`, `/en/index.html → /en/`). Live-tested every combination:

| URL tested | Result |
|---|---|
| `https://greek-cloud.com/athens` (no extension) | **404** |
| `https://greek-cloud.com/athens.html` | 200 |
| `https://greek-cloud.com/en/athens` (no extension) | **404** |
| `https://greek-cloud.com/en/athens.html` | 200 |
| `https://greek-cloud.com/Athens.html` (uppercase) | **404** (case-sensitive, good) |

**No duplicate-URL problem from cleanUrls.** Because `cleanUrls` is `false`, Vercel does not serve `/athens` for `/athens.html` — the extensionless path 404s. Only one canonical URL form is live per page. This part is fine as configured; do not enable `cleanUrls: true` without also adding redirects, or it will create exactly the dupe risk being tested for here.

**However, two CONFIRMED duplicate-URL defects found that were not asked about but matter for the same reason:**

1. **Trailing slash after `.html` returns 200, not 404 or redirect.** `https://greek-cloud.com/athens.html/` → HTTP 200, `Content-Length: 24263`, byte-identical (`diff` confirms) to `https://greek-cloud.com/athens.html`. Same `Etag`. This is Vercel's static-file server normalizing the trailing slash rather than 404ing. It is **not** currently a live indexing risk because the page self-canonicalizes to the slash-less URL (`<link rel="canonical" href="https://greek-cloud.com/athens.html">` even when served at the `/…/` URL) — confirmed on athens.html, applies to the shared template so it applies site-wide. But it is a second, silently-crawlable URL for every one of the 61 HTML pages with zero redirect, relying entirely on the canonical tag to consolidate it. **Recommendation: add a Vercel redirect (or rely on `cleanUrls:false` + a catch-all rule) to 301 `/*.html/` → `/*.html`.** Not fixable via a code line change in this repo without a redirect rule in `vercel.json`; would need a regex redirect source like `"source": "/:path(.*)\\.html/"` → `"destination": "/:path.html"`.

2. **Directory-index paths serve 200 without trailing slash, no redirect.** `https://greek-cloud.com/en` (no trailing slash) → 200, byte-identical to `https://greek-cloud.com/en/` (`Content-Length: 33815` both, `diff` confirms, same Etag). Same is true for `https://greek-cloud.com` root vs `/` — not testable as a distinct case since `/` is the only root form, but `/en` vs `/en/` is a clean repro. Again self-canonicalizes correctly (canonical on `/en` response is `https://greek-cloud.com/en/`), so not an active indexing problem, but it is an uncontrolled second crawlable URL. **Recommendation: add `"source": "/en", "destination": "/en/", "permanent": true` to the `redirects` array in vercel.json** (mirroring the existing `/index.html → /` pattern already there).

Neither of these is currently causing indexed duplicates (canonical tags are correct in both cases), so severity is **Medium**, not Critical — but they are genuine, confirmed gaps in the redirect config, not theoretical.

## 6. Host / protocol redirects (CONFIRMED)

- `http://greek-cloud.com/` → `308` → `https://greek-cloud.com/`. Single hop.
- `https://www.greek-cloud.com/` → `308` → `https://greek-cloud.com/`. Single hop.
- `http://www.greek-cloud.com/` → **2-hop chain**: `308` (http→https, still on www) → `308` (www→apex) → `200`. Confirmed via `curl -L -w num_redirects` = 2. Not broken, but not optimal — a crawler/user hitting the bare `http://www` form pays two redirect round-trips instead of one. **Recommendation (Low priority): collapse to a single redirect for the `http://www` entry point** — this requires a Vercel domain-level redirect config (outside `vercel.json`'s app-level redirects; likely a Vercel project domain setting) rather than a code fix in this repo.
- Double-slash `https://greek-cloud.com//athens.html` → `308` → `/athens.html`. Fine.

## 7. Security headers / CSP (CONFIRMED)

Live headers on `https://greek-cloud.com/` match `vercel.json` (lines with the `headers` array, source `/(.*)`) exactly: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Cross-Origin-Resource-Policy: same-origin`, `X-DNS-Prefetch-Control: off`. All present, all correct values.

**CSP does not block anything the pages actually use** (checked against real resource references, not assumption):
- `script-src 'self' 'unsafe-inline'` — covers the one inline theme/a11y-preference script in `<head>` (index.html) and all `/assets/*.js` files (same-origin).
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — covers the inline `<style>`/`style=` usage and the Google Fonts CSS `<link>` (`https://fonts.googleapis.com/css2?family=...`).
- `font-src 'self' https://fonts.gstatic.com` — covers the actual font files Google Fonts CSS resolves to.
- `connect-src 'self'` — grepped all `/assets/*.js` for `fetch(`/`XMLHttpRequest`; only two calls exist, both same-origin: `assets/intake.js:75` `fetch('/api/health')` and `assets/intake.js:247` `fetch('/api/submit', ...)`. No cross-origin fetch anywhere in the codebase, so `connect-src 'self'` is not blocking anything live.
- `https://wa.me` (WhatsApp) appears only as an `<a href>` navigation target, never as a fetched/loaded resource — not subject to CSP at all, so it doesn't need to be (and isn't) in any `-src` directive.
- No CSP violations would occur on any page checked (index, en/index, intake, en/intake).

**Accepted-risk note, not a new finding**: `script-src` includes `'unsafe-inline'`, which weakens XSS mitigation (no nonce/hash scheme). Given `SECURITY-NOTES.md` already exists in the repo root, this is presumably a documented tradeoff — flagging for completeness only, not recommending a change without checking that file's rationale first.

`/api/*` gets its own header block (`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`) — correct, API routes should never be indexed or cached.

## 8. Mobile (CONFIRMED, light check)

- Every one of the 61 HTML files carries exactly one `<meta name="viewport" content="width=device-width, initial-scale=1">` — checked via `grep -c` across all files, zero files with 0 or >1 matches.
- No responsiveness/tap-target defects found in the spot checks run; full CSS tap-target audit not performed (out of scope for the terse pass requested).

## 9. JavaScript rendering (CONFIRMED)

Static site, no build step, as expected: full page content (title, meta, headings, body copy, JSON-LD) is present in the **raw HTML** on both live fetch (`curl`, no JS execution) and local file read — confirmed on homepage, athens.html, guide.html. `innerHTML`/`document.write` usage exists only in `assets/a11y-widget.js`, `assets/intake.js`, `assets/notice.js`, `assets/settings.js`, `assets/whatsapp-widget.js` — all progressive-enhancement widgets (accessibility panel, cookie notice, WhatsApp chat button, form submission), not core content. No CSR dependency for indexable content.

## 10. Structured Data (spot-checked, CONFIRMED)

`application/ld+json` present on all sampled pages (index.html, en/index.html, athens.html, en/athens.html, guide.html — 1 block each). Homepage `@graph` includes `Organization`, `WebSite`, `Service` with an `Offer` (price 289 ILS) — no syntax errors observed in the fetched JSON (renders as valid JSON structurally; not run through a schema validator in this pass).

## 11. Core Web Vitals — lab measurement (NOT OBTAINED)

`pagespeed_check.py https://greek-cloud.com/ --strategy mobile` → **PSI rate limit exceeded (240 QPM / 25,000 QPD)**, no Lighthouse data returned. `--crux-only` → **requires a Google API key**, none configured in this environment. Homepage, an inner content page (athens.html), and a form page (intake.html) were the intended 3-page sample; none could be measured this pass.

`preload_check.py` (non-PSI, static/heuristic check) ran successfully on the homepage:
- Score 75/100.
- Speculation Rules present (1 inline block, `prefetch`+`prerender` actions) — good, no `Speculation-Rules` HTTP header though (`header_present: false`).
- `preload_hints: 0`, `fetchpriority_high: 0` — **no `fetchpriority="high"` on the LCP candidate image** and no `<link rel="preload">` for it. This is a real, actionable LCP risk: the hero/LCP image is discovered late by the browser's preload scanner. **Recommendation: add `fetchpriority="high"` to the LCP `<img>` tag on the homepage** (need to identify which element PSI would flag as LCP — likely the hero image in index.html; exact line not confirmed in this pass since Lighthouse didn't run to identify the LCP element definitively).
- bfcache signals clean (no `cache-control: no-store`, no unload/beforeunload listeners blocking bfcache).

**Action needed to complete CWV coverage**: obtain a Google API key for PSI/CrUX, or re-run after the rate limit window clears, to get real LCP/INP/CLS lab+field numbers for homepage + 2 inner pages. This is the one section of the requested scope not completed — stated here rather than guessed at.

---

## Summary of confirmed issues by priority

**Medium**
1. `/*.html/` (trailing slash) returns 200 with identical content instead of 301/404 — site-wide, mitigated by correct canonicals but should get a redirect rule in `vercel.json`.
2. `/en` (and any bare directory path) returns 200 without trailing slash instead of redirecting to `/en/` — same mitigation, same fix pattern (`redirects` array in `vercel.json`).

**Low**
3. `http://www.greek-cloud.com/` is a 2-hop redirect chain to reach the final URL — cosmetic, not indexing-relevant, likely a Vercel domain-config item outside `vercel.json`.
4. No `fetchpriority="high"` / preload on the presumed LCP image — worth doing since it's free, but couldn't confirm the exact element without Lighthouse.

**Not completed (environment limitation, not a site defect)**
5. PSI/CrUX lab and field Core Web Vitals data for homepage + 2 inner pages — blocked by PSI rate limit and missing CrUX API key.

**No issues found**
- Sitemap validity/coverage/status codes, canonical self-reference and host consistency, hreflang reciprocity/x-default/HE-only handling, noindex correctness, cleanUrls duplicate-URL risk (the specific concern raised — confirmed NOT present), host/protocol redirects (aside from the www 2-hop), CSP blocking real page functionality, viewport tag coverage, JS-rendering dependency for indexable content.
