# R4 · Content pipeline

Weekly, Monday 08:00 Asia/Jerusalem.

**One item per week. One PR. No more.** A backlog of five open content PRs nobody
has read is worth less than one good page that ships.

---

## 1. Pick the item

Read `seo/backlog.md` and take the **first item marked `todo`**, working down from
the top: translation items (C1–C4) come before structure items (S1–S4), which come
before depth items. Skip anything marked `blocked`, `in-pr` or `done`.

If everything actionable is `blocked`, the right outcome is a one-line report
saying the queue needs the owner. Do not invent work.

Mark the item `in-pr` in the same PR.

## 2. Research before writing

Use `seo-content-brief` to build a brief, and `seo-cluster` when the item is a new
page rather than a translation, to check it does not cannibalise an existing one.

For a translation (C1–C4), the Hebrew page is the source of truth. Translate the
substance, do not transliterate, and do not add claims the Hebrew page does not
make. Keep the same JSON-LD node types and adapt them.

## 3. Write it

Hebrew copy: use the `hebrew-content-writer` skill if available, and match the
register of the existing pages — plain, direct, second person plural, no marketing
inflation. English copy: match the existing `/en/` pages.

Then run `stop-slop` over the draft. It is required, not optional: the audit
already found repeated binary contrasts at paragraph ends and four consecutive
headings in the same negation shape on `remote-prescription.html`. Those are the
habits to avoid reproducing.

### Legal claims — the part that matters most

`CLAUDE.md` §1 is binding. In particular, and these are the errors that have
actually been published on this site before:

- never publish an Israeli **refusal rate** — no such figure exists
- never say an Israeli authority has **ruled** that a foreign prescription is no
  defence at the border; the honest form is that no provision authorises it and no
  authority recognises it
- the Greek indication list has **five** groups and is **not closed** — never write
  "four", and never write that something outside the list is not a recognised
  indication
- never write "regardless of THC content" about the hemp-flower retail ban; it is
  capped at 0.3% THC and it binds consumers, not only retailers
- the prescription is issued **remotely, from Israel, before the flight**; only
  dispensing happens in Greece

Every legal claim gets a linked primary source. If you cannot find one, cut the
claim — do not soften it and keep it.

## 4. Ship the page

- both `<title>` and meta description within the limits `check-seo.mjs` enforces
- canonical, the hreflang pair on **both** sides, `og:*` and `twitter:card`
- JSON-LD with the shared `Organization` `@id`, and FAQ answers that appear
  verbatim in the visible copy
- add it to `llms.txt` **by hand**, with a description in the voice of its
  neighbours
- `node scripts/build-sitemap.mjs`
- `npm run check` and `npm run check:dup` must both pass

## 5. Output

One PR, branch `seo/r4-YYYY-MM-DD`, titled with the page that was written. In the
body: which backlog item, what sources every legal claim rests on, and what you
deliberately did not claim. Note in the PR that IndexNow submission
(`npm run indexnow`) should follow once it is merged and deployed.
