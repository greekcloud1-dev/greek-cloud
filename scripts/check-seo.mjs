#!/usr/bin/env node
// SEO linter for greek-cloud.com. Exits non-zero on any error.
// This is the gate every automated change has to pass. See CLAUDE.md §5.
//
//   node scripts/check-seo.mjs            all pages
//   node scripts/check-seo.mjs athens.html  one page
//   node scripts/check-seo.mjs --json       machine-readable

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, ORIGIN, listPages, read, title, metaContent, canonical, alternates,
  isNoindex, headings, jsonLd, ldNodes, internalLinks, norm, Report,
} from './lib/pages.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const only = args.filter((a) => !a.startsWith('--'));

const pages = listPages().filter((p) => !only.length || only.includes(p.rel) || only.includes(p.slug));
if (!pages.length) {
  console.error('No pages matched.');
  process.exit(2);
}

const report = new Report();
const all = listPages();
const exists = new Set(all.map((p) => p.rel));
const byUrl = new Map(all.map((p) => [p.url, p]));

for (const page of pages) {
  const html = read(page);
  const P = page.rel;
  const noindex = isNoindex(html) || page.isErrorPage;

  /* ---------------------------------------------------------- title/desc */
  const t = title(html);
  if (!t) {
    report.error(P, 'title', 'no <title>');
  } else if (t.length > 65) {
    report.warn(P, 'title', `${t.length} chars, over 65 — Google will truncate`);
  } else if (t.length < 25) {
    report.warn(P, 'title', `${t.length} chars, under 25 — likely thin`);
  }

  const desc = metaContent(html, 'description');
  if (!desc) {
    report.error(P, 'description', 'no meta description');
  } else if (desc.length > 160) {
    report.error(P, 'description', `${desc.length} chars, over 160`);
  } else if (desc.length < 70) {
    report.warn(P, 'description', `${desc.length} chars, under 70`);
  }

  /* ------------------------------------------------------------ canonical */
  const canon = canonical(html);
  if (!canon) {
    if (!page.isErrorPage) report.error(P, 'canonical', 'missing');
  } else {
    if (!canon.startsWith('https://')) {
      report.error(P, 'canonical', `not absolute: ${canon}`);
    }
    if (canon !== page.url && !noindex) {
      report.error(P, 'canonical', `points at ${canon}, page is ${page.url}`);
    }
    if (/\.html\/$/.test(canon)) {
      report.error(P, 'canonical', 'trailing slash after .html');
    }
  }

  /* ------------------------------------------------------------- hreflang */
  const alts = alternates(html);
  if (!noindex) {
    const twin = page.lang === 'he' ? `en/${page.slug}` : page.slug;
    const twinExists = exists.has(twin);

    if (!alts.length) {
      report.error(P, 'hreflang', 'no alternates');
    } else {
      const langs = alts.map((a) => a.hreflang);
      if (!langs.includes('x-default')) {
        report.error(P, 'hreflang', 'no x-default');
      }
      if (twinExists && !langs.includes(page.lang === 'he' ? 'en' : 'he')) {
        report.error(P, 'hreflang', `twin ${twin} exists but is not declared`);
      }
      if (!twinExists && langs.includes(page.lang === 'he' ? 'en' : 'he')) {
        const claimed = alts.find((a) => a.hreflang === (page.lang === 'he' ? 'en' : 'he'));
        report.error(P, 'hreflang', `declares ${claimed.href} which does not exist`);
      }
      // self-reference
      const self = alts.find((a) => a.href === page.url);
      if (!self) {
        report.error(P, 'hreflang', 'no self-referencing alternate');
      }
      // reciprocity: the twin must point back
      if (twinExists) {
        const twinHtml = read(all.find((p) => p.rel === twin));
        const back = alternates(twinHtml).some((a) => a.href === page.url);
        if (!back) {
          report.error(P, 'hreflang', `${twin} does not point back at this page`);
        }
      }
    }
  }

  /* ----------------------------------------------------------- open graph */
  if (!noindex) {
    for (const key of ['og:title', 'og:description', 'og:url', 'og:image']) {
      if (!metaContent(html, key)) report.error(P, 'opengraph', `missing ${key}`);
    }
    if (!metaContent(html, 'twitter:card')) {
      report.warn(P, 'opengraph', 'no twitter:card');
    }
    const ogUrl = metaContent(html, 'og:url');
    if (ogUrl && ogUrl !== page.url) {
      report.error(P, 'opengraph', `og:url is ${ogUrl}, expected ${page.url}`);
    }
  }

  /* ----------------------------------------------------------- structured */
  const blocks = jsonLd(html);
  for (const [i, b] of blocks.entries()) {
    if (!b.ok) report.error(P, 'jsonld', `block ${i + 1} does not parse: ${b.error}`);
  }
  const nodes = ldNodes(html);
  if (!noindex && !nodes.length) {
    report.warn(P, 'jsonld', 'no structured data');
  }
  const org = nodes.find((n) => n['@type'] === 'Organization');
  if (org && org['@id'] !== `${ORIGIN}/#org`) {
    report.error(P, 'jsonld', `Organization @id is ${org['@id']}, expected ${ORIGIN}/#org`);
  }

  // Every FAQ answer must appear verbatim in the visible copy (CLAUDE.md §2).
  const visible = norm(html.slice(html.search(/<body\b/i)));
  for (const n of nodes) {
    if (n['@type'] !== 'Question') continue;
    const answer = n.acceptedAnswer?.text ?? (Array.isArray(n.acceptedAnswer) ? n.acceptedAnswer[0]?.text : null);
    if (!answer) {
      report.error(P, 'faq-mirror', `Question "${String(n.name).slice(0, 40)}…" has no acceptedAnswer.text`);
      continue;
    }
    if (!visible.includes(norm(answer))) {
      report.error(P, 'faq-mirror', `answer not in visible copy: "${norm(answer).slice(0, 60)}…"`);
    }
    if (n.name && !visible.includes(norm(n.name))) {
      report.error(P, 'faq-mirror', `question not in visible copy: "${norm(n.name).slice(0, 60)}…"`);
    }
  }

  /* ------------------------------------------------------------- headings */
  const hs = headings(html);
  const h1s = hs.filter((h) => h.level === 1);
  if (h1s.length === 0) report.error(P, 'headings', 'no h1');
  if (h1s.length > 1) report.error(P, 'headings', `${h1s.length} h1 elements`);
  let prev = 0;
  for (const h of hs) {
    if (prev && h.level > prev + 1) {
      report.error(P, 'headings', `h${prev} → h${h.level} skips a level ("${h.text.slice(0, 40)}")`);
    }
    prev = h.level;
  }

  /* ---------------------------------------------------------------- links */
  for (const href of new Set(internalLinks(html))) {
    const path = href.replace(ORIGIN, '').split(/[?#]/)[0];
    if (path === '/' || path === '') continue;
    if (/\.html\/$/.test(path)) {
      report.error(P, 'links', `trailing slash after .html: ${href}`);
    }
    const target = path.replace(/^\//, '');
    if (!target) continue;
    if (target.endsWith('/')) continue;                 // directory index
    if (!existsSync(join(ROOT, target))) {
      report.error(P, 'links', `broken internal link: ${href}`);
    }
    if (/^\/[a-z0-9-]+$/.test(path) && !path.includes('.')) {
      report.error(P, 'links', `extension-less link, cleanUrls is off: ${href}`);
    }
  }

  /* ------------------------------------------------------------ third-party */
  const externalScript = [...html.matchAll(/<script[^>]+src\s*=\s*"(https?:\/\/[^"]+)"/gi)];
  for (const m of externalScript) {
    report.error(P, 'csp', `third-party script, the CSP blocks it: ${m[1]}`);
  }
  if (/fonts\.googleapis\.com/.test(html)) {
    report.error(P, 'csp', 'Google Fonts stylesheet — fonts are self-hosted');
  }
}

/* ------------------------------------------------------------ site-wide */

if (!only.length) {
  const sitemapPath = join(ROOT, 'sitemap.xml');
  if (!existsSync(sitemapPath)) {
    report.error('sitemap.xml', 'sitemap', 'missing');
  } else {
    const xml = await import('node:fs').then((fs) => fs.readFileSync(sitemapPath, 'utf8'));
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const indexable = all.filter((p) => !isNoindex(read(p)) && !p.isErrorPage);
    for (const p of indexable) {
      if (!locs.includes(p.url)) {
        report.error('sitemap.xml', 'sitemap', `indexable page missing: ${p.url}`);
      }
    }
    for (const loc of locs) {
      const rel = byUrl.get(loc);
      if (!rel) {
        report.error('sitemap.xml', 'sitemap', `lists a page that does not exist: ${loc}`);
      } else if (isNoindex(read(rel))) {
        report.error('sitemap.xml', 'sitemap', `lists a noindex page: ${loc}`);
      }
    }
  }

  // llms.txt is hand-written and its per-page descriptions are better than the
  // meta descriptions, so it is never regenerated — only checked for coverage.
  const llmsPath = join(ROOT, 'llms.txt');
  if (!existsSync(llmsPath)) {
    report.error('llms.txt', 'llms', 'missing');
  } else {
    const llms = readFileSync(llmsPath, 'utf8');
    const linked = new Set([...llms.matchAll(/\((https:\/\/greek-cloud\.com[^)]*)\)/g)].map((m) => m[1]));
    const indexable = all.filter((p) => !isNoindex(read(p)) && !p.isErrorPage);
    for (const p of indexable) {
      if (!linked.has(p.url)) {
        report.error('llms.txt', 'llms', `indexable page not listed: ${p.url}`);
      }
    }
    for (const href of linked) {
      if (!byUrl.has(href)) {
        report.error('llms.txt', 'llms', `links to a page that does not exist: ${href}`);
      }
    }
  }
}

/* --------------------------------------------------------------- output */

if (asJson) {
  console.log(JSON.stringify({
    checked: pages.length,
    errors: report.errors.length,
    warnings: report.warnings.length,
    items: report.items,
  }, null, 2));
} else {
  if (!report.items.length) {
    console.log(`clean — ${pages.length} page(s) checked, no issues.`);
  } else {
    report.print();
  }
}

process.exit(report.errors.length ? 1 : 0);
