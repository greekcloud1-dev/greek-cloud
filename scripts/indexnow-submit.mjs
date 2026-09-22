#!/usr/bin/env node
// Submits changed URLs to IndexNow (Bing, Yandex, Seznam, Naver, Yep).
// Google rejects IndexNow, so this is the non-Google indexing surface only —
// and it is what feeds Microsoft Copilot citations.
//
//   node scripts/indexnow-submit.mjs                URLs changed since the last commit
//   node scripts/indexnow-submit.mjs --since HEAD~5
//   node scripts/indexnow-submit.mjs --all          every indexable URL
//   node scripts/indexnow-submit.mjs --dry-run      print the payload, send nothing

import { execFileSync } from 'node:child_process';
import { ROOT, ORIGIN, listPages, read, isNoindex } from './lib/pages.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const sinceIdx = args.indexOf('--since');
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : 'HEAD~1';

const KEY = process.env.INDEXNOW_KEY || '657aba77224ced8ed594032ef5f33f71';
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

const pages = listPages().filter((p) => !p.isErrorPage && !isNoindex(read(p)));
const byRel = new Map(pages.map((p) => [p.rel, p]));

let urls;
if (all) {
  urls = pages.map((p) => p.url);
} else {
  let changed = [];
  try {
    changed = execFileSync('git', ['diff', '--name-only', since, 'HEAD'], {
      cwd: ROOT, encoding: 'utf8',
    }).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    console.error(`could not read changed files since ${since}: ${e.message}`);
    process.exit(2);
  }
  urls = changed.map((f) => byRel.get(f)?.url).filter(Boolean);
}

urls = [...new Set(urls)];

if (!urls.length) {
  console.log('no indexable URLs changed — nothing to submit.');
  process.exit(0);
}

// IndexNow caps a single submission at 10,000 URLs; this site is far under that.
const payload = {
  host: new URL(ORIGIN).host,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList: urls,
};

console.log(`${urls.length} URL(s):`);
for (const u of urls) console.log(`  ${u}`);

if (dryRun) {
  console.log('\n--dry-run, not sending. Payload:');
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload),
});

// 200 = accepted, 202 = accepted but the key is still being validated.
const body = await res.text();
console.log(`\nIndexNow responded ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);

if (res.status === 200 || res.status === 202) process.exit(0);
console.error('submission was not accepted.');
process.exit(1);
