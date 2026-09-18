# Vendored skills

These skills are committed to the repository on purpose.

The scheduled cloud routines that maintain this site's SEO start from a cold
checkout: a fresh sandbox, a `git clone`, and nothing else. They do not inherit
the skills installed under a developer's `~/.claude/skills/`. Anything a routine
relies on has to be in the checkout, or the routine silently falls back to
improvising — which on a YMYL site is the failure mode worth the most effort to
avoid.

## What is here, and which routine needs it

| Skill | Used by |
|---|---|
| `seo-technical` | R1 daily health, R6 monthly audit |
| `seo-drift` | R1 daily health — baseline and regression detection |
| `seo-sitemap` | R3 — validates what `scripts/build-sitemap.mjs` produced |
| `seo-hreflang` | R3, R1 — HE↔EN reciprocity |
| `seo-schema` | R3, R6 — JSON-LD validation |
| `seo-page` | R4 — single-page check before a content PR |
| `seo-content`, `seo-content-brief`, `seo-cluster` | R4 content pipeline |
| `seo-programmatic` | R3 — thin-content and index-bloat guards |
| `seo-geo`, `seo-sxo` | R5 — AI answer engines and search-intent fit |
| `seo-images` | R6 |
| `seo-bing` | R2 — Bing Webmaster and IndexNow |
| `stop-slop` | R4 — required on every generated draft |

## Not vendored

- **`seo`** (the umbrella skill) ships a bundled runtime of roughly 29,000 files.
  It is too large to carry in a content repository, and the specialists above
  cover what the routines actually call.
- **`seo-google`** needs a Google service account that a cloud sandbox has no way
  to read. Vendoring it would only produce confident-looking failures. It stays
  out until credentials have somewhere to live.
- **`seo-dataforseo`, `seo-ahrefs`, `seo-profound`, `seo-seranking`,
  `seo-firecrawl`** all require paid API keys that are not connected.

## Licence

Third-party skills, vendored unmodified. Each carries its own `SKILL.md` with its
author and licence — the SEO set is MIT, by AgriciDaniel and contributors.
Upstream fixes are picked up by re-copying a directory, not by editing in place:
local edits here would be lost and would silently diverge from the version a
developer runs locally.
