#!/usr/bin/env node
// Cross-page duplication check for the destination pages.
//
// Why this exists: on 2026-09-18 the eleven city pages were deduplicated —
// 28 sentences appeared verbatim on six or more pages, and eight of eleven
// shared 52-58% of their sentences with a sibling. Scoring each page on its own
// misses this completely; it only shows up when the pages are diffed against
// each other. This is the guard that keeps it from coming back.
//
//   node scripts/check-duplication.mjs           Hebrew pages
//   node scripts/check-duplication.mjs --en      English pages
//   node scripts/check-duplication.mjs --json
//
// Exits non-zero when a pair exceeds MAX_PAIR_OVERLAP or a sentence appears on
// more than MAX_SHARED_PAGES pages.

import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { ROOT, norm } from './lib/pages.mjs';

const CITIES = [
  'athens', 'thessaloniki', 'crete', 'rhodes', 'kos', 'corfu',
  'santorini', 'mykonos', 'zakynthos', 'lefkada', 'halkidiki',
];

// Thresholds: the post-dedup range was 30-38% pairwise. 45% leaves room for
// honest drift while still catching a page that has been re-templated.
const MAX_PAIR_OVERLAP = 0.45;
const MAX_SHARED_PAGES = 5;
const MIN_WORDS = 6; // ignore boilerplate fragments like "דף הבית"

// A short sentence repeated across pages is usually deliberate: the legal
// warning that the prescription is valid in Greece only, or the one-line link
// text pointing at the page that owns a national rule. Both are required on
// every city page (CLAUDE.md §1.6, §2). What the dedup actually removed were
// paragraph-length explainers, so only a long shared block is a finding.
const WIDESPREAD_MIN_WORDS = 35;

const en = process.argv.includes('--en');
const asJson = process.argv.includes('--json');
const prefix = en ? 'en/' : '';

/** The page's own prose: <main> only, minus nav, header, footer and the CTA. */
function sentences(file) {
  const html = readFileSync(file, 'utf8');
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const stripped = main
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<section class="final[\s\S]*?<\/section>/gi, ' ')
    .replace(/<div class="next-up"[\s\S]*?<\/div>/gi, ' ')
    .replace(/<table[\s\S]*?<\/table>/gi, ' '); // facts tables are meant to differ
  return norm(stripped)
    .split(/(?<=[.!?])\s+|\s+—\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= MIN_WORDS);
}

const pages = new Map();
for (const city of CITIES) {
  const file = join(ROOT, `${prefix}${city}.html`);
  if (!existsSync(file)) continue;
  pages.set(city, new Set(sentences(file)));
}

if (pages.size < 2) {
  console.log(`only ${pages.size} destination page(s) found under ${prefix || '/'} — nothing to compare.`);
  process.exit(0);
}

/* ------------------------------------------------- pairwise overlap */

const names = [...pages.keys()];
const pairs = [];
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const a = pages.get(names[i]);
    const b = pages.get(names[j]);
    const shared = [...a].filter((s) => b.has(s));
    // Jaccard against the smaller page: "how much of the shorter page is reused"
    const overlap = shared.length / Math.min(a.size, b.size);
    pairs.push({ a: names[i], b: names[j], overlap, shared: shared.length });
  }
}
pairs.sort((x, y) => y.overlap - x.overlap);

/* ----------------------------------------- sentences on many pages */

const spread = new Map();
for (const [city, set] of pages) {
  for (const s of set) {
    if (!spread.has(s)) spread.set(s, []);
    spread.get(s).push(city);
  }
}
const widespread = [...spread.entries()]
  .filter(([s, cities]) => cities.length > MAX_SHARED_PAGES
    && s.split(/\s+/).length >= WIDESPREAD_MIN_WORDS)
  .sort((a, b) => b[1].length - a[1].length);

/* ------------------------------------------------- national-rules guard */

// A national rule may be mentioned in passing and linked; what it may not do is
// be *explained* on the city page. The signal is length, not the keyword: the
// block removed in the dedup was ~180 words. A topic sentence plus a link to the
// owning page is the intended shape and must not be flagged. CLAUDE.md §2.
const OWNED_ELSEWHERE = [
  {
    topic: /תורנ|duty pharmac|duty rota|הפסקת הצהריים|afternoon break/i,
    owner: 'pharmacies-greece.html#hours',
    maxWords: 60,
  },
  {
    topic: /להביא: דרכון|Bring your passport/i,
    owner: 'pharmacies-greece.html#counter',
    maxWords: 45,
  },
];
const restatements = [];
for (const [city, set] of pages) {
  for (const sentence of set) {
    for (const rule of OWNED_ELSEWHERE) {
      if (!rule.topic.test(sentence)) continue;
      const words = sentence.split(/\s+/).length;
      if (words > rule.maxWords) {
        restatements.push({ city, owner: rule.owner, words, sentence });
      }
    }
  }
}

/* ------------------------------------------------------------ output */

const failures = [
  ...pairs.filter((p) => p.overlap > MAX_PAIR_OVERLAP).map((p) => ({
    kind: 'pair-overlap',
    message: `${p.a} / ${p.b}: ${(p.overlap * 100).toFixed(0)}% shared (${p.shared} sentences)`,
  })),
  ...widespread.map(([s, cities]) => ({
    kind: 'widespread-sentence',
    message: `on ${cities.length} pages (${cities.join(', ')}): "${s.slice(0, 70)}…"`,
  })),
  ...restatements.map((r) => ({
    kind: 'restated-national-rule',
    message: `${r.city}: ${r.words}-word block on a rule owned by ${r.owner} — link it instead`,
  })),
];

if (asJson) {
  console.log(JSON.stringify({
    scope: en ? 'en' : 'he',
    pages: pages.size,
    pairs: pairs.map((p) => ({ ...p, overlap: Number(p.overlap.toFixed(3)) })),
    widespread: widespread.map(([s, c]) => ({ sentence: s, pages: c })),
    failures,
  }, null, 2));
} else {
  console.log(`${pages.size} destination pages under ${prefix || '/'}\n`);
  console.log('highest pairwise overlap:');
  for (const p of pairs.slice(0, 6)) {
    const flag = p.overlap > MAX_PAIR_OVERLAP ? ' <-- over threshold' : '';
    console.log(`  ${(p.overlap * 100).toFixed(0).padStart(3)}%  ${p.a} / ${p.b}  (${p.shared} sentences)${flag}`);
  }
  const worst = pairs[0].overlap;
  const median = pairs[Math.floor(pairs.length / 2)].overlap;
  console.log(`\n  worst ${(worst * 100).toFixed(0)}%, median ${(median * 100).toFixed(0)}%, threshold ${MAX_PAIR_OVERLAP * 100}%`);

  if (widespread.length) {
    console.log(`\n${widespread.length} block(s) of ${WIDESPREAD_MIN_WORDS}+ words on more than ${MAX_SHARED_PAGES} pages:`);
    for (const [s, cities] of widespread.slice(0, 10)) {
      console.log(`  ${cities.length}x  "${s.slice(0, 80)}…"`);
    }
  } else {
    console.log(`\nno block of ${WIDESPREAD_MIN_WORDS}+ words appears on more than ${MAX_SHARED_PAGES} pages.`);
  }

  if (restatements.length) {
    console.log('\nnational rules restated instead of linked:');
    for (const r of restatements) {
      console.log(`  ${r.city}  ${r.words} words -> belongs to ${r.owner}`);
      console.log(`    "${r.sentence.slice(0, 90)}…"`);
    }
  }

  console.log(failures.length ? `\n${failures.length} failure(s).` : '\nclean.');
}

process.exit(failures.length ? 1 : 0);
