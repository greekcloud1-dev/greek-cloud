#!/usr/bin/env node
// SEO drift snapshot for greek-cloud.com. Prints the SEO-critical elements of
// every indexable page as JSON, for R1's baseline capture / compare. See
// seo/routines/R1-health-drift.md §3.
//
//   node scripts/drift-snapshot.mjs > seo/state/drift/baseline.json

import { listPages, read, title, metaContent, canonical, alternates, isNoindex, headings, ldNodes } from './lib/pages.mjs';

const pages = listPages().filter((p) => !p.isErrorPage);
const snapshot = {};

for (const page of pages) {
  const html = read(page);
  if (isNoindex(html)) continue;

  const nodes = ldNodes(html);
  snapshot[page.path] = {
    title: title(html),
    description: metaContent(html, 'description'),
    canonical: canonical(html),
    hreflang: alternates(html).map((a) => `${a.hreflang}:${a.href}`).sort(),
    h1: headings(html).filter((h) => h.level === 1).map((h) => h.text),
    jsonLdTypes: nodes.map((n) => n['@type']).flat().filter(Boolean).sort(),
    jsonLdNodeCount: nodes.length,
  };
}

console.log(JSON.stringify(snapshot, null, 2));
