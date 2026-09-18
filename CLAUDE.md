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
- **No third-party scripts, ever.** The CSP in `vercel.json` is
  `script-src 'self' 'unsafe-inline'` / `connect-src 'self'`, and `assets/notice.js`
  promises visitors there are no analytics and no advertising pixels. Google
  Analytics, GTM, Meta Pixel, Hotjar and friends are all out — both technically
  blocked and a broken promise. Measurement comes from Search Console, not the page.
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

---

## 5. Generated files — never hand-edit

| File | Generated by |
|---|---|
| `sitemap.xml` | `npm run build:sitemap` |
| `llms.txt` | `npm run build:llms` |
| the 11 HE + 11 EN city pages | `npm run build:pages` (source: `_build/cities*.json`) |

`npm run check` must pass before any commit. It is the gate that makes automation
safe; if it fails, the fix is the content, not the check.

---

## 6. Git

- **Never push to `main`.** Every change goes through a pull request.
- Verify the branch and the remote before every commit — concurrent sessions can
  switch HEAD silently:
  `git branch --show-current && git remote get-url origin`
- Never deploy to production without asking the owner first.

---

## 7. Competitive context

The real competitor is **medtouristgr.com** (same model, 50 sitemap URLs, already
localised for Israelis at `/he/medical-cannabis-greece`, prices €22/€31/€39, and it
owns the AI-citation territory for this niche). Benchmark *strategy* against it.

**canaflight.com** ranks for nothing — not one Hebrew head term, not even its own
brand name — and its registration runs to July 2027. Never plan around it
disappearing, and never treat it as the incumbent.

The winnable prize is the generic Hebrew head terms, which no commercial service
currently holds: the Hebrew SERP's transactional layer is empty, and every Hebrew
page that does rank answers a different question (how to carry an *Israeli* licence
into Greece) rather than how to obtain a *Greek* prescription remotely.
