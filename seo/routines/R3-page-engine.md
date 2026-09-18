# R3 · Structure, sitemap and schema

Monthly, 1st at 10:00 Asia/Jerusalem.

Keeps the derived files honest and the destination pages structurally sound.

**Read this before touching a city page.** There is no page generator in this
repository and that is deliberate. The eleven destination pages are not uniform:
`rhodes`, `kos` and `corfu` carry a `#ferry` section, `halkidiki` carries
`#athos`, `zakynthos` leads with `#flights`, and `lefkada` orders its sections
differently. That variation is the *result* of the 2026-09-18 deduplication, not
an inconsistency to tidy up. Forcing the eleven through one template would
recreate the near-duplicate pattern that the dedup existed to remove. Do not
build such a generator, and do not "normalise" a page toward its siblings.

---

## 1. Regenerate what is derived

```
node scripts/build-sitemap.mjs
node scripts/check-seo.mjs
```

`sitemap.xml` is derived from the filesystem: URL set and hreflang alternates
from the files, `lastmod` from each file's last commit. Editorial `priority` and
`changefreq` live in `seo/sitemap-priority.json` and are preserved, never
recomputed. If the generator reports URLs with no entry there, add one with a
priority consistent with comparable pages, and say in the PR why you chose it.

`llms.txt` is **not** generated. Its per-page descriptions are hand-written and
better than the meta descriptions. `check-seo.mjs` verifies coverage; if a page
is missing, write its description yourself in the same voice as its neighbours.

## 2. Validate structure

Use `seo-hreflang`, `seo-schema` and `seo-sitemap`.

- hreflang reciprocity across all HE↔EN pairs, and that each `x-default` points
  at the Hebrew page
- JSON-LD: every block parses, the `Organization` node is `@id`
  `https://greek-cloud.com/#org` on every page, every `Article` references it as
  `author` and `publisher` and carries an `image`
- every `FAQPage` answer appears verbatim in the visible copy — `check-seo.mjs`
  enforces this, but read any failure carefully rather than "fixing" it by
  editing the JSON-LD to match a typo in the copy

## 3. Audit the destination pages

Run `node scripts/check-duplication.mjs` and `--en`. Report the worst pairwise
overlap and the median against the 45% threshold, and whether they moved since
last month.

Then confirm each of the eleven Hebrew pages still has:

- its own four-row facts table (airport, where the pharmacies are, the drive from
  the resort areas, what closes off season)
- at least three FAQs, all place-specific
- a **link** to `pharmacies-greece.html#hours` and `pharmacies-greece.html#counter`
  rather than a restatement of what those sections say
- one paragraph of national process linking to `remote-prescription.html` and
  `guide.html`, not a restatement

Note which of the eleven have no English twin and confirm those correctly declare
no `en` alternate.

## 4. Output

`seo/reports/YYYY-MM-DD-structure.md`, plus a PR if anything changed. Branch:
`seo/r3-YYYY-MM-DD`. Keep derived-file regeneration in its own commit, separate
from any content fix, so the diff stays readable.
