#!/usr/bin/env node
// Regenerates sitemap.xml from the filesystem.
//
// Mechanical parts are derived: which URLs exist, their hreflang alternates,
// and lastmod from the file's last commit. The editorial part — priority and
// changefreq — is hand-tuned and lives in seo/sitemap-priority.json, so a
// rebuild never flattens it. A URL with no entry there gets a default and is
// reported so someone can set it deliberately.
//
//   node scripts/build-sitemap.mjs            write sitemap.xml
//   node scripts/build-sitemap.mjs --dry-run  print the diff, write nothing

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, listPages, read, isNoindex } from './lib/pages.mjs';

const dryRun = process.argv.includes('--dry-run');
const PRIORITY_FILE = join(ROOT, 'seo', 'sitemap-priority.json');
const DEFAULT = { priority: '0.5', changefreq: 'monthly' };

const editorial = existsSync(PRIORITY_FILE)
  ? JSON.parse(readFileSync(PRIORITY_FILE, 'utf8'))
  : {};

/** Last commit date for a file, YYYY-MM-DD. Falls back to today. */
function lastmod(relPath) {
  try {
    const out = execFileSync(
      'git', ['log', '-1', '--format=%cs', '--', relPath],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (out) return out;
  } catch { /* not a repo, or the file is untracked */ }
  return new Date().toISOString().slice(0, 10);
}

const all = listPages();
const indexable = all
  .filter((p) => !p.isErrorPage && !isNoindex(read(p)))
  .sort((a, b) => a.url.localeCompare(b.url));

const exists = new Set(all.map((p) => p.rel));
const unpriced = [];

const body = indexable.map((page) => {
  const twin = page.lang === 'he' ? `en/${page.slug}` : page.slug;
  const hasTwin = exists.has(twin);
  const he = page.lang === 'he' ? page : all.find((p) => p.rel === twin);
  const en = page.lang === 'en' ? page : all.find((p) => p.rel === twin);

  const alts = [`    <xhtml:link rel="alternate" hreflang="he" href="${he.url}"/>`];
  if (hasTwin && en) {
    alts.push(`    <xhtml:link rel="alternate" hreflang="en" href="${en.url}"/>`);
  }
  // x-default points at the Hebrew page: it is the origin language of the site.
  alts.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${he.url}"/>`);

  const ed = editorial[page.url];
  if (!ed) unpriced.push(page.url);
  const { priority, changefreq } = ed ?? DEFAULT;

  return [
    '  <url>',
    `    <loc>${page.url}</loc>`,
    ...alts,
    `    <lastmod>${lastmod(page.rel)}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');
});

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
  '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...body,
  '</urlset>',
  '',
].join('\n');

const target = join(ROOT, 'sitemap.xml');
const current = existsSync(target) ? readFileSync(target, 'utf8') : '';

if (unpriced.length) {
  console.warn(`\n${unpriced.length} URL(s) have no entry in seo/sitemap-priority.json`);
  console.warn(`defaulting to priority ${DEFAULT.priority} / ${DEFAULT.changefreq}:`);
  for (const u of unpriced) console.warn(`  ${u}`);
  console.warn('');
}

if (xml === current) {
  console.log(`sitemap.xml already current — ${indexable.length} URLs.`);
  process.exit(0);
}

if (dryRun) {
  const a = current.split('\n');
  const b = xml.split('\n');
  console.log('--- sitemap.xml would change ---');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      if (a[i] !== undefined) console.log(`- ${a[i]}`);
      if (b[i] !== undefined) console.log(`+ ${b[i]}`);
    }
  }
  process.exit(0);
}

writeFileSync(target, xml, 'utf8');
console.log(`sitemap.xml written — ${indexable.length} URLs.`);
