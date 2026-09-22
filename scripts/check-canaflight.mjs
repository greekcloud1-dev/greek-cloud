#!/usr/bin/env node
// Watches canaflight.com's takedown and reports when it changes.
//
// Background: on 2026-09-17 the site was replaced by a "לא זמין" placeholder.
// Every URL answers 200 with `X-Robots-Tag: noindex, nofollow, noarchive,
// nosnippet`, robots.txt deliberately keeps crawling OPEN so that header can be
// read, and the sitemap still lists its 28 URLs with a fresh lastmod so Google
// re-crawls them and drops them. That is a correct noindex removal, not a
// mistake -- see the comment block in their own robots.txt.
//
// Its own robots.txt calls the state "temporarily offline" and refers to "once
// the site is back". This script exists to notice the day that happens, because
// a returning canaflight.com is a price-undercutting competitor on the same
// Hebrew terms (169/249/349 against 289/379).
//
// What it deliberately does NOT do: decide whether the domain ranks. That needs
// a search API this repo has no credential for (see config.credentials
// .deliberatelyAbsent), and a scraped SERP would be worse than no answer. R5
// answers the ranking question qualitatively; this script answers the
// deterministic half -- what the server actually returns.
//
//   node scripts/check-canaflight.mjs           compare against stored state
//   node scripts/check-canaflight.mjs --json    machine-readable
//   node scripts/check-canaflight.mjs --save    write the new snapshot
//
// Exit 0 = nothing material changed. Exit 1 = something did, read the output.
// Exit 2 = the probe itself failed (network), which is not a finding.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(ROOT, 'seo/state/competitors/canaflight.json');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const save = args.includes('--save');

const ORIGIN = 'https://www.canaflight.com';
const TIMEOUT_MS = 15000;

/* The placeholder is identified by its title rather than by byte size: a tweak
   to its wording should not read as "the site came back". */
const PLACEHOLDER_TITLE = 'לא זמין';

async function get(url, method = 'GET') {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'user-agent': 'greekcloud-competitor-watch/1.0' },
    });
    const body = method === 'GET' ? await res.text() : '';
    return {
      ok: true,
      status: res.status,
      finalUrl: res.url,
      robotsTag: res.headers.get('x-robots-tag'),
      body,
    };
  } finally {
    clearTimeout(timer);
  }
}

function titleOf(html) {
  const m = html.match(/<title[^>]*>([^<]*)</i);
  return m ? m[1].trim() : '';
}

async function probe() {
  const snap = {
    checkedAt: new Date().toISOString().slice(0, 10),
    reachable: true,
    root: {},
    robotsTxt: {},
    sitemap: {},
    samples: [],
  };

  const root = await get(ORIGIN + '/');
  snap.root = {
    status: root.status,
    finalUrl: root.finalUrl,
    robotsTag: root.robotsTag,
    title: titleOf(root.body),
    bytes: root.body.length,
    isPlaceholder: titleOf(root.body) === PLACEHOLDER_TITLE,
  };

  const robots = await get(ORIGIN + '/robots.txt');
  const robotsBody = robots.status === 200 ? robots.body : '';
  snap.robotsTxt = {
    status: robots.status,
    // A blanket Disallow would be the damaging change: it stops crawlers ever
    // reading the noindex header, freezing the URLs in the index instead of
    // dropping them out.
    hasBlanketDisallow: /^\s*Disallow:\s*\/\s*$/mi.test(robotsBody),
    declaresSitemap: /^\s*Sitemap:/mi.test(robotsBody),
  };

  const sm = await get(ORIGIN + '/sitemap.xml');
  const locs = sm.status === 200 ? [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]) : [];
  const mods = sm.status === 200 ? [...sm.body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]) : [];
  snap.sitemap = {
    status: sm.status,
    urlCount: locs.length,
    latestLastmod: mods.sort().at(-1) || null,
  };

  /* A handful of inner URLs, not just the root: a partial restore would bring
     back real pages while the homepage still shows the placeholder. */
  const sample = locs.slice(0, 6).length ? locs.slice(0, 6) : [ORIGIN + '/guide.html'];
  for (const url of sample) {
    try {
      const r = await get(url);
      snap.samples.push({
        url: url.replace(ORIGIN, ''),
        status: r.status,
        robotsTag: r.robotsTag,
        isPlaceholder: titleOf(r.body) === PLACEHOLDER_TITLE,
      });
    } catch {
      snap.samples.push({ url: url.replace(ORIGIN, ''), status: null, robotsTag: null, isPlaceholder: null });
    }
  }

  const noindexed = snap.samples.filter((s) => /noindex/i.test(s.robotsTag || ''));
  snap.summary = {
    placeholderEverywhere: snap.root.isPlaceholder && snap.samples.every((s) => s.isPlaceholder),
    noindexOnAllSamples: snap.samples.length > 0 && noindexed.length === snap.samples.length,
    contentIsBack: !snap.root.isPlaceholder || snap.samples.some((s) => s.isPlaceholder === false),
  };

  return snap;
}

function diff(prev, now) {
  const changes = [];
  if (!prev) return changes;

  if (prev.summary.contentIsBack !== now.summary.contentIsBack && now.summary.contentIsBack) {
    changes.push('MATERIAL: real content is being served again — canaflight.com is back');
  }
  if (prev.summary.noindexOnAllSamples && !now.summary.noindexOnAllSamples) {
    changes.push('MATERIAL: the noindex header is gone from at least one URL — they intend to be indexed again');
  }
  if (!prev.robotsTxt.hasBlanketDisallow && now.robotsTxt.hasBlanketDisallow) {
    changes.push('robots.txt now carries a blanket Disallow — their URLs will freeze in the index instead of dropping out');
  }
  if (prev.sitemap.urlCount !== now.sitemap.urlCount) {
    changes.push(`sitemap URL count ${prev.sitemap.urlCount} → ${now.sitemap.urlCount}`);
  }
  if (prev.root.status !== now.root.status) {
    changes.push(`root status ${prev.root.status} → ${now.root.status}`);
  }
  if (prev.root.title !== now.root.title) {
    changes.push(`root <title> "${prev.root.title}" → "${now.root.title}"`);
  }
  return changes;
}

let now;
try {
  now = await probe();
} catch (e) {
  const msg = `probe failed: ${e && e.message ? e.message : e}`;
  if (asJson) console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
  else console.error(msg);
  process.exit(2);
}

const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
const changes = diff(prev, now);

if (asJson) {
  console.log(JSON.stringify({ ok: true, changes, previous: prev, current: now }, null, 2));
} else {
  console.log(`canaflight.com — checked ${now.checkedAt}`);
  console.log(`  root            ${now.root.status} ${now.root.finalUrl}`);
  console.log(`  title           "${now.root.title}" (${now.root.bytes} bytes)`);
  console.log(`  placeholder     ${now.summary.placeholderEverywhere ? 'yes, on every sampled URL' : 'NO — content present somewhere'}`);
  console.log(`  noindex header  ${now.summary.noindexOnAllSamples ? 'on all sampled URLs' : 'MISSING on at least one URL'}`);
  console.log(`  robots.txt      ${now.robotsTxt.hasBlanketDisallow ? 'BLANKET DISALLOW' : 'crawl open (correct)'}`);
  console.log(`  sitemap         ${now.sitemap.urlCount} URLs, latest lastmod ${now.sitemap.latestLastmod}`);
  console.log('');
  if (!prev) console.log('No stored state — run with --save to record this as the baseline.');
  else if (!changes.length) console.log('No change since ' + prev.checkedAt + '.');
  else changes.forEach((c) => console.log('CHANGE: ' + c));
}

if (save) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(now, null, 2) + '\n', 'utf8');
  if (!asJson) console.log('\nSnapshot written to seo/state/competitors/canaflight.json');
}

process.exit(changes.length ? 1 : 0);
