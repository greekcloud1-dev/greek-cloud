# R5 · Competitors and AI answer engines — 2026-09-24

**Headline: greek-cloud.com was cited in zero of 15 AI-answer-engine checks this week (8 Hebrew head terms, 4 English head terms, 3 natural-language questions). medtouristgr.com appeared in 5, all English — it is as absent from the Hebrew results as this site is.** No competitor moved its price or made a legal claim this site needs to rebut. This is the first R5 run, so every state file below is a baseline, not a diff — next week is the first real trend point.

---

## 1. medtouristgr.com

No prior snapshot existed (`seo/state/competitors/medtouristgr.json` was absent — this routine has not run before), so this week's fetch is the baseline. Sitemap: 50 URLs, matching the count already recorded in CLAUDE.md §7.

Pricing unchanged from what CLAUDE.md already records: €22/€31/€39 (Priority Prescription Preparation / Basic Consulting / Premium Concierge), refundable if the physician declines.

**What's new since the CLAUDE.md snapshot was written:** eight nationality-specific `/greece-travel-guide-<country>` pages exist now — israel, usa, germany, italy, france, netherlands, bulgaria, poland — all last-modified 2026-06-24 or 2026-07-12. `/greece-travel-guide-israel` is a hybrid: general Greece travel planning (destinations, seasons, packing) plus a cannabis-service pitch, explicitly warning that "home-country medical cannabis familiarity does not automatically transfer to Greece." Paired with ten single-destination `<city>-travel-guide` pages (Athens, Thessaloniki, Mykonos, Santorini, Crete, Rhodes, Corfu, Zante, Kos) that mirror this site's eleven city pages but are travel-guide framed rather than prescription-process framed, plus a `community` page and a UK-specific page. Read together, this looks like an attempt to capture broader travel-intent search terms as an entry point into the cannabis funnel — a wider top of funnel than the pure "medical cannabis Greece" positioning this site and medtouristgr's core pages share.

The Hebrew page (`/he/medical-cannabis-greece`, lastmod 2026-06-24) makes no refusal-rate claim and no claim that an Israeli licence is valid or recognised at the border — nothing here conflicts with CLAUDE.md §1.1 or §1.2, so no rebuttal is needed this week.

Full URL list, pricing detail and observations: `seo/state/competitors/medtouristgr.json`.

## 2. canaflight.com — takedown watch

`npm run check:canaflight`: **no change since 2026-09-19.** Placeholder page, `noindex` header on every sampled URL, robots.txt crawl left open, sitemap still 28 URLs at lastmod 2026-09-17. Neither material trigger (content back, or noindex header removed) fired. Snapshot re-saved with `--save`, one field updated (`checkedAt`).

## 3. AI answer-engine visibility

No credential exists in this repo for a real AI-answer-engine API (ChatGPT, Perplexity, Google AI Overviews), so this check uses WebSearch as the observable proxy — a Google-backed search whose synthesized summary approximates what an AI assistant would draw on. That is a real limitation, noted per the runbook's own caveat that these surfaces are noisy; treat this as the first point in a trend, not a verdict.

Checked all 8 `headTerms.he`, all 4 `headTerms.en`, and the 3 runbook questions (15 total). Full per-query domain list: `seo/state/competitors/ai-visibility.json`.

- **greek-cloud.com: 0/15.** Not cited, not linked, not in the synthesized summary, for any term in either language.
- **medtouristgr.com: 5/15**, all on the English side (all 4 English head terms, plus the English natural-language question). It did not appear once across the 8 Hebrew head terms, and appeared in only one of the two Hebrew questions, and only after WebSearch had to re-run the query because the first pass returned nothing but Israeli-domestic-license content (Clalit, Meuhedet, Maccabi health-fund pages) instead of anything about Greece.
- The Hebrew results are dominated by two clusters that answer a different question than either site is asking: (a) Israeli health-fund pages about the *domestic* cannabis licence, and (b) Israeli-run guides on carrying an *Israeli* licence abroad (notaryon-online.com selling notarized translations, infomed.co.il forum threads, mako.co.il, the Hebrew-IDN domain xn--4dbcyzi5a.com). This is exactly the gap CLAUDE.md §7 already names: "the Hebrew SERP's transactional layer is empty, and every Hebrew page that does rank answers a different question... rather than how to obtain a Greek prescription remotely." This week's search confirms it directly rather than by inference — nobody, including medtouristgr, currently holds that Hebrew transactional space.
- One data point worth flagging on accuracy, not competition: for "האם רישיון קנאביס ישראלי תקף ביוון", the synthesized answer stated cannabis is "not legal" in Greece today — stale/wrong, since medical cannabis has been dispensable from Greek pharmacies since February 2024. No site is currently the citation source correcting this, this one included.

## 4. Search-intent fit — `guide.html`

Ran `seo-sxo` against `/guide.html` (Hebrew, primary market), the page this site would want cited for "איך מקבלים מרשם קנאביס רפואי ביוון" and the head terms in general.

- **Page type: long-form process guide** — table of contents, eight numbered sections (legal framework → why the Israeli licence doesn't help → eligibility → the four-step process → cost table → pharmacy pickup → what's forbidden → common mistakes), an FAQ block with matching `FAQPage` JSON-LD, a pricing table, internal links to the deeper pages on each subtopic. This is the shape an answer engine would want to quote from — direct question/answer pairs, a cost table instead of cost-in-prose, numbered steps.
- **SERP consensus check:** for the Hebrew queries, there is no consistent competing page type to be mismatched against — the results aren't process guides at all, they're health-fund licence pages and Israeli travel-abroad forum threads (see §3). For the English equivalent, the SERP consensus *is* long-form process/service pages (medtouristgr's own pages, NuggMD, medicaltouristgreece.com), and `guide.html`'s structure matches that type.
- **Verdict: no page-type mismatch.** The content shape is not the problem here — the problem, per §3, is that the page (or any page on this site) isn't surfacing at all for its target Hebrew queries. That's an indexation/authority/citation gap, not a content-format gap, and it's outside what a single-page SXO pass can diagnose further; it needs the Search Console data R2 already tracks and, longer-term, the backlink/authority signal this site doesn't yet have a way to measure (no DataForSEO/Ahrefs credential — see `config.json`).

## 5. What this changes about the backlog

Nothing here contradicts CLAUDE.md. No page content was changed by this routine. Two items added to `seo/backlog.md` Discovered — see there for detail.

## Limitations

- No Search Console, ChatGPT, Perplexity, or AI-Overview API credential — AI-visibility is measured via WebSearch as a proxy, which is the best available signal but not the same measurement. Track the trend over weeks; the single-week numbers above are not a verdict on either site's actual answer-engine citation rate.
- No DataForSEO/Ahrefs — cannot say whether medtouristgr's new travel-guide pages are actually ranking or driving traffic, only that they exist and when they were last modified.
- This is R5's first run, so §1 and §3's state files are baselines with nothing to diff against yet.
