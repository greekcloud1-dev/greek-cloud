# FAQPage acceptedAnswer vs. visible page text — verification

**Method:** one Python script (`faq_check.py`) parsed every `<script type="application/ld+json">` block in all 61 files under `C:\kkk\greekcloud` (`*.html` and `en\*.html`, excluding `404.html`), walked `@graph` to find every `FAQPage` node, and collected every `Question.name` / `acceptedAnswer.text` pair. For each file it built the visible page text by stripping `<script>`, `<style>`, and all remaining tags. Both the answer text and the visible text were normalized identically before comparison:

- HTML entities decoded (`&quot;`, `&amp;`, `&nbsp;`, `&#8211;`, etc.) via `html.unescape`
- Hebrew punctuation folded to ASCII equivalents: maqaf `־` (U+05BE) → `-`, geresh `׳` (U+05F3) → `'`, gershayim `״` (U+05F4) → `"`
- Curly quotes (`' ' " "`) and en/em dashes (`– —`) folded to `'` / `-`
- All whitespace runs (including `&nbsp;`) collapsed to a single space
- Whitespace directly before punctuation (an artifact of replacing inline tags like `<a>...</a>.` with a space during stripping) removed, so `"text ."` and `"text."` compare equal

For each answer, the script checked whether the normalized answer text is a substring of the normalized visible page text.

## Result

**230 Question/acceptedAnswer pairs checked across every `FAQPage` block on every page. Zero mismatches.**

Every `acceptedAnswer.text` in every `FAQPage` block, on every Hebrew and English page, is present verbatim (after the normalization above) in that page's visible copy. No divergence to report.

### Note on raw substring matching without normalization

Before normalization, a naive byte-for-byte substring check flagged 7 files as having "mismatches." All 7 were false positives caused by two normalization gaps, not real content divergence:

- **Hebrew maqaf vs. ASCII hyphen** (`halkidiki.html`, `lefkada.html`, `pharmacies-greece.html`, `pharmacy-prices.html`, `zakynthos.html`): the JSON-LD answer text uses a plain ASCII hyphen (`-`) in numeric ranges (e.g. "40-50 דקות"), while the rendered page uses the Hebrew maqaf character (`־`) for the same ranges. Visually near-identical, different Unicode code point.
- **Space-before-period from tag stripping** (`index.html`, `en/index.html`): answers ending in a linked phrase followed by a period (e.g. `...הפירוט במדיניות הביטולים וההחזרים.` / `...Full policy.`) appeared to diverge only because stripping `<a>...</a>` before the period inserted a space that isn't present in the rendered page.

Both are resolved by the normalization rules above, confirming there is no real FAQPage/visible-copy divergence anywhere on the site.
