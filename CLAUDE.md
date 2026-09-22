# GreekCloud — house rules

Static hand-authored HTML. No framework, no build step for the site itself.
Hebrew at the root (`/athens.html`), English under `/en/` (`/en/athens.html`).
Deployed to Vercel from `greekcloud1-dev/greek-cloud`.

Read this file in full before changing anything. It encodes decisions that were
expensive to reach and are easy to undo by accident.

---

## 1. Legal and editorial rules (YMYL — these are not style preferences)

This site tells patients what is and is not lawful. A wrong or overstated legal
claim is worse than a hedge, and the honest version is also the more citable one
for AI answer engines. Every legal claim carries a linked primary source.

**1.1 Never publish an Israeli refusal rate.**
IMCA publishes counts of *active licences*, never applications-received vs denied.
No such figure exists in gov.il material, Knesset research or the literature.
Write "Israel does not publish refusal rates" and cite the re-hearing service
(`gov.il/he/service/cannabis-rediscussion`) as proof that refusals happen.
If a competitor publishes a percentage, that is their weakness, not a benchmark.

**1.2 Never say an Israeli authority has ruled that a foreign prescription is no
defence at the border.** No such publication exists. The correct register is:
*no provision authorises it and no authority recognises it* — an argument from the
absence of an authorising provision, never from a quoted ruling. Overclaiming here
is the single largest legal-accuracy risk on the site.

**1.3 Do rebut the "Israelis can now fly to Greece with medical cannabis" story by
name.** It traces to sponsored placements (calcalix.co.il, labelled תוכן שיווקי;
bizportal.co.il under `/bizpoint-sponsored/`) promoting a private permit service,
citing no procedure, statute or authority. It is contradicted by Nohal 110
(exporters must be licensed businesses; no patient pathway), Nohal 106 (silent on
foreign travel) and every IMCA page.

**1.4 The Greek indication list has FIVE groups and it is not closed.**
Source of truth: EOF core SPC (ΚΥΑ Δ3(γ)/40642/6-8-2024, ΦΕΚ Β′04581) §4.1 as
approved at the 16th session of 25/11/2025 — read the PDF, not secondary coverage.
Groups: (1) severe nausea/vomiting from chemo, radiotherapy or combination therapy
against HIV/hepatitis C; (2) chronic pain from cancer or CNS/peripheral nerve
disease incl. neuropathic; (3) spasticity in MS or spinal-cord lesions; (4) appetite
stimulant in palliative care for cancer or AIDS; (5) inflammatory bowel disease
(ΙΦΝΕ), added 25/11/2025, which "does not replace established IBD therapies".
Not first-line, verbatim: «δεν μπορεί σε καμία περίπτωση να αποτελεί θεραπεία
πρώτης επιλογής».
**Never write "four groups"**, and **never write that anything outside the list is
not a recognised indication** — EOF amends the list. Both errors were published on
this site and corrected on 2026-09-10. Sleep disorders, anxiety and migraine remain
absent as standalone indications; that part is correct.

**1.5 Law 5302/2026 art. 43(2) is capped at 0.3% THC and binds the consumer.**
**Never write "regardless of THC content"** — that is EOF's plain-language gloss and
read literally it sweeps in pharmacy medical cannabis flower at 1–31% THC, which
arts. 44–46 keep in a separate regime. The ban reaches **purchase and use by
consumers**, not just retailers. Both errors were published and corrected 2026-09-10.

**1.6 The prescription is issued remotely, from Israel, before the flight.**
A Greek-licensed physician reviews the request while the customer is still in
Israel. Only the **dispensing** happens at a licensed pharmacy inside Greece.
Never write that the customer must be in Greece to be seen or to be prescribed.
The sentence "המרשם והמוצרים תקפים בשטח יוון בלבד" on the city pages, `terms.html`
and `intake.html` is CORRECT and must not be touched.

---

## 2. The city pages were deduplicated — do not undo it

On 2026-09-18 the eleven Hebrew destination pages and their `/en/` mirrors were
deduplicated. Before: 28 sentences appeared verbatim on six or more pages, and
eight of eleven shared 52–58% of their sentences with a sibling. After: 30–38%.

**Never paste these back into a city page:**
- the ~180-word "opening hours / duty rota" explainer — it belongs to
  `pharmacies-greece.html#hours`, which the city pages link to instead
- the three-item "what to bring" list — now one line linking to
  `pharmacies-greece.html#counter`
- the two generic FAQ entries ("what do I bring to the pharmacy in X", "the
  pharmacy was closed midday") — replaced per page with place-specific questions
- the two-paragraph restatement of the national process — now one paragraph
  linking to `remote-prescription.html` and `guide.html`

Anything true of all of Greece lives on the page that owns it and is **linked**,
not restated. Each city page instead carries a four-row table of its own facts.

Measure duplication with a sentence-overlap diff **across all eleven pages**, not a
per-page quality score — scoring pages individually misses this entirely.

Any FAQ edit must be mirrored in the page's JSON-LD: `acceptedAnswer.text` has to
appear verbatim in the visible copy, and the comparison must normalise whitespace
and HTML entities or it produces false mismatches.

---

## 3. Vocabulary

The site says **מימוש / לממש / מממשים** for collecting the prescription at the
pharmacy. It no longer says פדיון / לפדות / פודים. `_build/cities*.json` still
carries the old wording in places; the shipped HTML is correct.

Hebrew brand spelling of the competitor CanaFlight is **קנאפלייט** (one alef).

---

## 4. Technical constraints

- **URLs keep `.html`.** `vercel.json` sets `cleanUrls: false`. Never emit an
  extension-less internal link.
- **Only one third-party script: GA4, behind consent** (owner decision 2026-09-22).
  `assets/notice.js` is a consent gate: GA4 loads only after "accept"; `GA_ID` in that
  file is the single switch (empty = no analytics at all). The CSP in `vercel.json`
  allows exactly googletagmanager.com / google-analytics.com for it. No other pixels
  (Meta, Hotjar, GTM containers); privacy.html describes only GA4.
- Fonts are **self-hosted** under `/assets/fonts/`. Do not reintroduce the Google
  Fonts stylesheet. (`_build/page.tpl` still references it — the template is stale.)
- Stylesheets shipped per page are `base.css` + `doc.css` (plus `home.css` on the
  homepage). `settings.css` and `a11y-widget.css` were merged into `base.css`.
- `X-Robots-Tag: noindex, nofollow` is scoped to `/api/*` only. It must never be
  widened to the site.
- `intake.html` is `noindex` by design and is deliberately **not** disallowed in
  `robots.txt` — a noindex directive has to be crawlable to be obeyed.
- IndexNow key: `657aba77224ced8ed594032ef5f33f71`, served from the file of the same
  name at the site root.
- **Functions run in `fra1`** (`"regions"` in `vercel.json`). The privacy policy
  promises the full request -- passport, health description -- is processed in an EU
  data centre in Frankfurt. Before 2026-09-23 it actually ran in `iad1` (US). Do not
  drop the setting; check `X-Vercel-Id` reads `fra1::fra1::` after a deploy.
- **The two intake pages must carry the same fields.** `tests/form-contract.test.mjs`
  sends each page's real fields through `/api/submit`. It exists because
  `en/intake.html` lacked the `c_health` consent and every English submission was
  refused. A new required field goes into the server, both pages and the test together.

---

## 5. What is generated, and what is not

| File | How it is maintained |
|---|---|
| `sitemap.xml` | **Generated.** `npm run build:sitemap`. Never hand-edit. |
| `seo/sitemap-priority.json` | Hand-edited. Holds the editorial `priority` and `changefreq` the generator preserves. |
| `llms.txt` | **Hand-written.** Its per-page descriptions are better than the meta descriptions, so it is never generated — only checked for coverage by `npm run check`. Write new entries in the voice of their neighbours. |
| the 11 HE + 11 EN city pages | **Hand-written, and deliberately not uniform.** There is no generator and one must not be built — see below. |

### There is no city-page generator, on purpose

`_build/` contains `page.tpl`, `en-page.tpl` and `cities*.json`, which look like
an unfinished programmatic-SEO system. They are not a starting point:

- `page.tpl` is stale — it still loads Google Fonts and the pre-merge stylesheets
- `cities.json` holds 8 of the 11 cities, 2 of the 4 FAQs per page, none of the
  facts tables, and the pre-2026-09-18 vocabulary (פדיון, not מימוש)
- the eleven live pages are structurally different **because of** the
  deduplication: `#ferry` on rhodes/kos/corfu, `#athos` on halkidiki, `#flights`
  leading zakynthos, a different section order on lefkada

Templating them would flatten that variation and recreate the near-duplicate
pattern §2 exists to prevent. Do not build a generator, and do not normalise one
city page toward another.

`npm run check` and `npm run check:dup` must pass before any commit. They are the
gate that makes automation safe; if one fails, the fix is the content, not the
check.

---

## 6. Git and deployment

- **`main` is the Vercel production branch**; pushing/merging to it is the deploy.
- **Claude deploys itself, without asking** (owner decision 2026-09-22, replaces the old
  PR-and-owner-merge rule). The price is a mandatory self-check before every push to main:
  work in a dedicated worktree branch; `git fetch` and merge latest `origin/main` first
  (never overwrite another session's work); `npm test`, `npm run check` and
  `npm run check:dup` clean; re-read the diff against sections 1-4; push; then verify the live URL serves
  the new content. If anything is broken live, revert at once. Report what went live.
- Verify the branch and the remote before every commit — concurrent sessions can
  switch HEAD silently:
  `git branch --show-current && git remote get-url origin`
- Still ask first for anything destructive or hard to revert: DNS, the domain,
  deleting data or branches, force-push, changing secrets.

---

## 7. Competitive context

The real competitor is **medtouristgr.com** (same model, 50 sitemap URLs, already
localised for Israelis at `/he/medical-cannabis-greece`, prices €22/€31/€39, and it
owns the AI-citation territory for this niche). Benchmark *strategy* against it.

**canaflight.com** ranks for nothing — not one Hebrew head term, not even its own
brand name. It was **taken down on 2026-09-17** (placeholder page plus
`X-Robots-Tag: noindex` on every URL, crawl deliberately left open so the noindex
can be read), but its own robots.txt calls that state temporary and its
registration runs to July 2027. So it never became the incumbent, and it has not
gone away either — never plan around either. `npm run check:canaflight` watches
for its return and R5 reports on it weekly.

The winnable prize is the generic Hebrew head terms, which no commercial service
currently holds: the Hebrew SERP's transactional layer is empty, and every Hebrew
page that does rank answers a different question (how to carry an *Israeli* licence
into Greece) rather than how to obtain a *Greek* prescription remotely.

---

## 8. Audience and stage (set by the owner, 2026-09-19)

**The primary market is Israeli.** Hebrew pages are the product; `/en/` is
secondary. Between two otherwise comparable items, the Hebrew-side one wins. An
English translation is not to be promoted on the argument that it opens a new
market — that call has been made.

**The service has served real customers and the pipeline works end to end**
(owner, 2026-09-19 — corrected the same day from an earlier misreading that
recorded zero). Reviews and named testimonials are therefore **actionable, not
blocked**: there are past customers to ask. They are the highest-value unblocked
item on the site — see T1 in `seo/backlog.md`.

Two things still cannot be manufactured and must never be invented: a named
author with credentials the site does not have, and first-hand detail on the
city pages that nobody has actually observed.

**A Google Business Profile is not available and must not be attempted.** Google
requires in-person contact with customers during stated hours. This service has
none: the prescription is issued remotely and dispensing happens at a Greek
pharmacy the business does not operate. Virtual offices, mailbox addresses and a
home address customers never visit are all explicitly prohibited, and a suspended
listing on a YMYL medical service is hard to undo. Do not propose workarounds.

---

## 9. Search Console access (set 2026-09-22)

A Google Cloud service account (`seo-routines@greek-cloud-seo.iam.gserviceaccount.com`)
has restricted read access to `sc-domain:greek-cloud.com` in Search Console. The
owner's local Claude Code session holds the private key and can pull live data
at any time.

**R2's cloud environment does not have this credential, and will not get it via
that environment's `environment_variables` field** — that field is plaintext
and visible to anyone using the environment, which is not an acceptable place
for a private key. This was evaluated and declined on 2026-09-22; do not
revisit it as an open question. Community MCP connectors for Search Console
were also considered and declined — they route the data through a third
party's infrastructure for no offsetting benefit here.

The working arrangement instead: the owner's local session pulls a snapshot
into `seo/state/gsc/YYYY-MM-DD.json` periodically, and R2 reads the freshest
file there (see `seo/routines/R2-measurement.md` §0) rather than calling the
API itself. This is not real-time, but it is the safe path until a proper
secrets mechanism exists for cloud routines.
