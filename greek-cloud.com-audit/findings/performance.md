# Performance / Core Web Vitals — greek-cloud.com

Measured 2026-09-18. Tools: Lighthouse 13.4.1 CLI (local, Node v24.20.0, mobile+desktop,
`--throttling-method=simulate`), `curl` (single-sample, unthrottled, real network), and direct
inspection of `C:\kkk\greekcloud` (HTML `<head>`, `assets/`, `vercel.json`).

**Coverage note (read this first):** PSI API calls failed for the whole session
(`PSI rate limit exceeded (240 QPM / 25,000 QPD)` — no Google API key is configured in this
environment, so calls fall back to the shared unkeyed quota, which was already exhausted).
`lcp_subparts.py` and CrUX-based tools need the same key and errored with
`CrUX API requires an API key`. I switched to a local Lighthouse CLI (`npx lighthouse`) instead,
which produced real lab data for the homepage. While running the same CLI against `/en/` and
`/guide.html`, live requests began timing out/erroring (Chrome interstitial, launcher crash) —
the coordinator confirmed other parallel agents were hammering the site at the same time and told
me to stop making live requests. **As a result, full lab metrics (LCP/FCP/CLS/TBT) are
measured only for the homepage (mobile + desktop).** For `/en/`, `/guide.html`,
`/pharmacy-prices.html`, `/athens.html` I report the one `curl` sample I captured before the stop
order (TTFB, document bytes) and otherwise give structurally-derived estimates, clearly labeled.
Do not treat the estimated rows as field data.

---

## 1. Homepage `https://greek-cloud.com/` — MEASURED (Lighthouse 13.4.1, lab)

### Mobile (simulated slow-4G/mid-tier CPU throttle)

| Metric | Value | CWV status |
|---|---|---|
| Performance score | 85/100 | — |
| LCP | **3258 ms** | Needs improvement (>2.5s) |
| FCP | 3258 ms (identical to LCP — nothing paints before the LCP element) | — |
| CLS | **0.0549** | Good (<0.1) |
| TBT (lab proxy for INP) | 0 ms | Good |
| Speed Index | 3566 ms | — |
| TTI | 3258 ms | — |
| Total byte weight | 269,712 bytes transferred (368,699 bytes uncompressed) | — |
| Network requests | 21 | — |
| Document TTFB (real, `server-response-time` audit) | 88 ms | fast |

### Desktop

| Metric | Value | CWV status |
|---|---|---|
| Performance score | 65/100 | — |
| LCP | **3301 ms** | Needs improvement |
| FCP | 3151 ms | — |
| CLS | **0.0025** | Good |
| TBT | 0 ms | Good |
| Total byte weight | 269,722 bytes | — |
| Network requests | 22 | — |

### LCP element (measured, both devices)

`div.wrap > div.hero-grid > div > h1` — the Hebrew headline text
("מרשם קנאביס רפואי ביוון..."), **not** the hero logo image. Confirmed identically on mobile and
desktop via `lcp-breakdown-insight`.

### LCP subparts (measured)

Because the LCP element is text (no image resource to fetch for the element itself), only two of
the four CrUX subparts are non-zero — this is expected/correct per the LCP subpart model, not a
measurement gap:

| Subpart | Mobile | Desktop |
|---|---|---|
| TTFB | 361 ms (simulated-throttle model) / 88 ms (real, unthrottled) | 274 ms (simulated) |
| Resource load delay | 0 ms (n/a — text node) | 0 ms |
| Resource load time | 0 ms (n/a — text node) | 0 ms |
| **Element render delay** | **1376 ms** | **1743 ms** |

Element render delay is the dominant subpart on both devices: the h1 cannot paint until the
browser finishes building the CSSOM, which is blocked on every render-blocking stylesheet in
`<head>` (see §2).

### CLS root cause (measured)

3 layout shifts, totaling 0.0549 (mobile):
- `section.hero > div.wrap > div.hero-grid > div.hero-logo` shifts twice (0.0362 + 0.0158),
  both attributed by Lighthouse to **"Web font loaded"** — 7 separate webfont swaps land after
  first paint and reflow the hero-logo column.
- `header.site-head > div.wrap > a.btn` (the header CTA) shifts once (0.0028).

This directly contradicts the prior audit's "CLS 0" note — CLS is currently 0.0549 on mobile
(still within "Good," but not zero). On desktop the same shifts happen but contribute far less
(0.0025) because the wider viewport changes how much the hero-logo column actually moves.

### Prior-audit discrepancy (flagging, not confirming a cause)

The known context states a prior audit measured **LCP 2008 ms**. Today's measurement is
**3258–3301 ms**, roughly +1250–1300 ms worse. I cannot confirm the cause (different Lighthouse
version/throttling profile is one plausible explanation), but file mtimes are circumstantial
evidence worth checking before ruling out a real regression: `assets/whatsapp-widget.css`,
`assets/whatsapp-widget.js`, and `assets/notice.js` all show a 2026-09-18 (today) mtime, and
`whatsapp-widget.css` is one of the two stylesheets Lighthouse flags with a measured 183 ms
critical-path cost (§2). If that file is newly added to the render-blocking chain, it would
partly explain the gap. This is a hypothesis, not a measured fact — I did not diff against a
previous Lighthouse run.

---

## 2. Render-blocking chain in `<head>` — MEASURED (homepage) + local inspection (all pages)

Verified in `C:\kkk\greekcloud\index.html` lines 29–37: **5 local stylesheets** (not 4 — the
"known context" is out of date, `whatsapp-widget.css` is a 5th) plus the Google Fonts stylesheet:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amatic+SC:wght@700&family=Suez+One&family=Assistant:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="/assets/base.css">
<link rel="stylesheet" href="/assets/settings.css">
<link rel="stylesheet" href="/assets/a11y-widget.css">
<link rel="stylesheet" href="/assets/whatsapp-widget.css">
<link rel="stylesheet" href="/assets/home.css">
```

Per-page stylesheet count (confirmed by grep, local files — not all 5 pages use the same set):

| Page | Local stylesheets in `<head>` | Disk bytes (uncompressed) |
|---|---|---|
| `/` (index.html) | base, settings, a11y-widget, whatsapp-widget, **home** | 26,988+11,026+7,119+2,340+22,051 = 69,524 |
| `/en/` | base, settings, a11y-widget, whatsapp-widget, **doc**, **home** (6 files) | 69,524+4,482 = 74,006 |
| `/guide.html`, `/pharmacy-prices.html`, `/athens.html` | base, settings, a11y-widget, whatsapp-widget, **doc** (no home.css) | 26,988+11,026+7,119+2,340+4,482 = 51,955 |

### Render-blocking cost — MEASURED (Lighthouse `render-blocking-insight`, homepage only)

Mobile — total estimated savings **1,730 ms** (metricSavings: FCP 1750 ms, LCP 1750 ms):

| Resource | Transfer bytes | Wasted ms (critical-path cost) |
|---|---|---|
| Google Fonts CSS (`fonts.googleapis.com/css2?...`) | 1,243 | **972 ms** |
| `base.css` | 8,356 | 183 ms |
| `whatsapp-widget.css` | 1,278 | 183 ms |
| `a11y-widget.css` | 2,803 | (parallelized, not the tail) |
| `home.css` | 7,288 | (parallelized, not the tail) |
| `settings.css` | 3,892 | (parallelized, not the tail) |

Desktop — total estimated savings **1,490 ms** (FCP 1500 ms, LCP 1500 ms): same six requests,
Google Fonts CSS wastedMs 901 ms, `base.css`/`home.css` 179 ms each, others parallelized.

**The Google Fonts stylesheet request alone accounts for ~55–65% of the entire measured
render-blocking budget**, on both devices, despite the `preconnect` hints already in place —
preconnect opens the connection but does not eliminate the request→response round trip, and the
returned CSS then triggers a second cross-origin fetch for the actual `.woff2` files.

### Font cost — MEASURED (homepage network request list)

The Google Fonts CSS response (7,773 bytes raw, 1,243 bytes transferred) declares 20 `@font-face`
rules across 3 families/11 unique files; the page (Hebrew, `he`/`RTL`) actually downloads **7 of
the 11 `.woff2` files**:

| File (family) | Transfer bytes |
|---|---|
| Assistant #1 | 22,598 |
| Amatic SC #1 | 18,706 |
| Suez One #1 | 14,862 |
| Assistant #2 | 11,342 |
| Assistant #3 | 7,453 |
| Suez One #2 | 6,577 |
| Amatic SC #2 | 5,985 |
| **Font files subtotal** | **87,523** |
| + Fonts stylesheet | 1,243 |
| **Total font cost** | **88,766 bytes (33% of the page's 269,712-byte transfer weight)** |

That is more total weight than the single largest image on the page (`logo-lg.webp`, 107,040
bytes) once you add the stylesheet's own critical-path cost. 7 separate webfont swaps is also the
direct, measured cause of the CLS in §1.

---

## 3. `fetchpriority` — MEASURED: not used anywhere on the site, and not the fix for LCP here

```
grep -rn "fetchpriority" --include="*.html" C:\kkk\greekcloud   →  0 matches, site-wide
```

The measured LCP element on both mobile and desktop is the **h1 text**, not the hero logo image
(`assets/logo-lg.webp`, 107 KB, `<img>` at index.html:204). `fetchpriority` only applies to
elements that fetch a resource (`img`, `link`, `script`, `iframe`) — it cannot be attached to a
text node, so its absence is **not** the bug causing the 3.2–3.3s LCP. Do not "fix" this by
slapping `fetchpriority="high"` on the hero image; it would not move LCP because the image isn't
the LCP element (confirmed by measurement, not assumed). If the hero layout is ever changed so the
image becomes the LCP candidate (e.g., stacking the image above the h1 on narrow viewports), revisit
this — at that point `fetchpriority="high"` on `index.html:204`'s `<img>` would be the right
fix. For now, the real lever for this text LCP is reducing the render-blocking chain in §2.

---

## 4. Caching — MEASURED headers, ESTIMATED gain from hashing

Confirmed in `C:\kkk\greekcloud\vercel.json`:

```json
{ "source": "/assets/:file(.+\\.(?:css|js))",
  "headers": [{ "key": "Cache-Control", "value": "public, max-age=3600, stale-while-revalidate=86400" }] }
{ "source": "/assets/:file(.+\\.(?:png|webp|jpg|jpeg|svg|ico|woff2?))",
  "headers": [{ "key": "Cache-Control", "value": "public, max-age=2592000, stale-while-revalidate=86400" }] }
```

CSS/JS: 1-hour fresh + 24-hour stale-while-revalidate. Images: 30-day fresh + 24-hour SWR.
No content hash in any filename (`base.css`, `settings.css`, etc. are static names) — confirmed via
`ls assets/`. `package.json` confirms **there is no build step** ("No build step for the site
itself"), so there's currently no mechanism to even produce hashed filenames.

**Honest framing of the gain (estimated, not measured — Lighthouse always audits a cold cache,
so it cannot show a caching-header improvement):**
- Within the current 1-hour `max-age` + 24-hour `stale-while-revalidate` window (i.e., any repeat
  page view within ~25 hours), Chrome already serves the 5 render-blocking CSS files from cache
  instantly with a background revalidation — content-hashing would save close to **0 ms** here.
- Outside that ~25-hour window (a visitor returning after a day or more — plausible for this
  audience, given the described multi-day medical-tourism booking journey), the current setup
  forces a full re-fetch of all 5 stylesheets. Content-hashed filenames + `Cache-Control: public,
  max-age=31536000, immutable` would turn that into a 100% cache hit (0 network requests) instead.
  Using the *measured* cold-fetch cost of those exact files as the baseline (§2: 183 ms × 2 measured
  + comparable cost for the other 3 render-blocking files), the estimated saving for that
  return-visit population is **roughly 400–600 ms off LCP**, plus 23,617 bytes of transfer removed
  (mobile, 5 CSS files) — this is an estimate extrapolated from measured per-file costs, not a
  second Lighthouse run with different headers.
- This is a caching/repeat-visit fix, not a first-visit LCP fix — say so explicitly to whoever
  prioritizes it.

---

## 5. Other pages — what's measured vs. estimated

| URL | TTFB (curl, single sample, real, unthrottled) | Total time | Doc size (bytes) | Lab LCP/FCP/CLS/TBT |
|---|---|---|---|---|
| `/` | 312 ms | 360 ms | 39,977 | **Measured**, see §1 |
| `/en/` | 288 ms | 335 ms | 33,815 | Attempted live via Lighthouse; run crashed (Chrome launcher error) once parallel-agent load hit the site. **Not measured.** |
| `/guide.html` | 329 ms | 355 ms | 36,918 | Attempted live; Chrome returned an interstitial (site under load from other agents). **Not measured.** |
| `/pharmacy-prices.html` | 329 ms | 360 ms | 30,480 | Not attempted after the stop order. **Not measured.** |
| `/athens.html` | 319 ms | 328 ms | 24,263 | Not attempted after the stop order. **Not measured.** |

**Estimated LCP for the 4 unmeasured pages**, based on local structural comparison only (same
render-blocking CSS chain as §2, same fonts, same base.css/settings.css/a11y-widget.css/
whatsapp-widget.css; the 3 inner content pages swap `home.css`→`doc.css` and drop the 107 KB
`logo-lg.webp` hero image entirely, using only the small `logo.webp`/`logo.png` mark, 20.9 KB):
- `/en/`: expect LCP close to `/` (same 6-stylesheet chain, actually one file heavier — `doc.css`
  is additive there, not a swap), roughly **3.2–3.4 s** mobile. Estimate, not measured.
  All 5 inner pages carry an h1/lede LCP candidate similarly gated behind the same
  render-blocking chain, so expect the same ~1.4–1.8 s element-render-delay dominance.
- `/guide.html`, `/pharmacy-prices.html`, `/athens.html`: lighter than `/` (no 107 KB hero image,
  5 stylesheets instead of the home-page's mix), so total byte weight should be lower
  (roughly 160–200 KB vs. home's 270 KB transfer, estimated from disk-size deltas), but the
  render-blocking-CSS+fonts critical path is identical, so LCP should land in a similar
  **~2.8–3.3 s** mobile range — estimated, not measured. Do not treat these numbers as field
  data; re-run Lighthouse on these 4 URLs once traffic contention clears.

TBT: not measured on any of the 4 unmeasured pages; homepage TBT was 0 ms on both devices and none
of these pages carry additional heavy JS, so 0 ms is a reasonable (but unverified) expectation.

---

## 6. Fixes, prioritized by measured impact

| # | File | Change | Expected saving | Measured or estimated |
|---|---|---|---|---|
| 1 | `index.html`, `en/index.html`, `guide.html`, `pharmacy-prices.html`, `athens.html` (all page `<head>`s) + new `assets/fonts/*.woff2` | Self-host the 3 font families (subsetted to the weights actually used) instead of `https://fonts.googleapis.com/css2?...`; add `@font-face` rules to `base.css` (same-origin, HTTP/2-multiplexed with the other CSS, no extra DNS/TLS hop) | **~700–950 ms off LCP** | Partly measured: the removed request currently costs 972 ms (mobile)/901 ms (desktop), measured via `render-blocking-insight`. The same-origin replacement cost (~50–100 ms) is estimated. |
| 2 | `assets/base.css` (new `@font-face` block) + all `<head>`s | Cut the 7 downloaded `.woff2` files down to only the weights rendered above the fold at first paint (e.g., Assistant bold for the h1); defer/async-load the rest (Amatic SC, extra Assistant weights, Suez One) after `load` | **CLS ~0.055 → ~0.02–0.03 (estimated)**; **~50–60 KB less transfer (measured file sizes, estimated as removable)** | Estimated — Lighthouse's render-blocking audit doesn't itemize non-blocking font fetches, but the CLS culprit list (measured) directly attributes 5 of the 7 font files to the two hero-logo layout shifts, so removing/deferring them should proportionally reduce CLS. |
| 3 | `index.html`, `en/index.html`, `guide.html`, `pharmacy-prices.html`, `athens.html` `<head>` | Defer `assets/a11y-widget.css` (2,803 B transfer) and `assets/whatsapp-widget.css` (1,278 B transfer) with the `media="print" onload="this.media='all'"` pattern (or inject via JS after `load`) — neither widget is part of the h1/LCP ancestor chain | **~183 ms off LCP** (removing `whatsapp-widget.css` from the blocking set) | Measured — 183 ms is `whatsapp-widget.css`'s exact `wastedMs` value from `render-blocking-insight` (mobile). `a11y-widget.css`'s own wastedMs wasn't isolated in the report (parallelized), so its removal's saving is not separately measured. |
| 4 | `assets/base.css`, `assets/settings.css`, `assets/a11y-widget.css`, `assets/home.css` | Concatenate the stylesheets that DO need to stay render-blocking (base+settings+home, or base+settings+doc on inner pages) into a single file, served from one connection | **~20–50 ms (estimated)** | Estimated — HTTP/2 already multiplexes these in parallel, so consolidating mainly saves per-request framing/header overhead, not RTTs. Low priority compared to #1–#3. |
| 5 | `vercel.json` header rule for `/assets/:file(.+\.(?:css\|js))` + a deploy-time hashing step (none exists today — `package.json` confirms no build step) | Add content hashes to `base.css`/`settings.css`/etc. filenames and change their `Cache-Control` to `public, max-age=31536000, immutable` | **~0 ms for visits within 25h (SWR already covers that); ~400–600 ms off LCP for return visits >25h after the previous visit** (removes a full cold-cache re-fetch of ~24 KB transfer) | Estimated — extrapolated from the measured cold-fetch `wastedMs` values in §2; not verified with a second Lighthouse run against different headers (impossible to simulate cache state changes without re-running against modified headers on a live deploy). |
| 6 | *(no action needed)* — `fetchpriority` | Do not add `fetchpriority="high"` to the hero image; it is not the LCP element (measured) | 0 ms — would not help | Measured (LCP element confirmed via `lcp-breakdown-insight` on both devices) |

## 7. What still needs measurement once contention clears

- Full Lighthouse mobile+desktop runs for `/en/`, `/guide.html`, `/pharmacy-prices.html`,
  `/athens.html` (attempted for the first two, failed due to concurrent load from other agents;
  not attempted for the last two per the coordinator's stop order).
- A second PSI/CrUX pass once a Google API key is configured — this session had none, so all
  field data (CrUX) and PSI-hosted Lighthouse runs were unavailable all session
  (`PSI rate limit exceeded` / `CrUX API requires an API key`); everything above came from a
  local Lighthouse CLI run instead.
- Re-run after implementing fix #1 (font self-hosting) to confirm the LCP improvement lands where
  estimated, and re-check whether it also closes some of the gap to the prior audit's 2008 ms
  figure.
