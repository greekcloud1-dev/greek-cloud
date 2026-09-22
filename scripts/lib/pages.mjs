// Shared helpers for the GreekCloud SEO scripts.
// No dependencies: these run in a cold cloud checkout with no `npm install`.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ORIGIN = 'https://greek-cloud.com';

/** Every .html file in the site, root (Hebrew) and /en/ (English). */
export function listPages() {
  const out = [];
  for (const dir of ['', 'en']) {
    const abs = join(ROOT, dir);
    let entries;
    try {
      entries = readdirSync(abs);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.html')) continue;
      const full = join(abs, name);
      if (!statSync(full).isFile()) continue;
      const rel = relative(ROOT, full).split(sep).join('/');
      // vercel.json redirects /index.html -> / and /en/index.html -> /en/,
      // so the indexable URL of a directory index is the directory itself.
      const path = name === 'index.html' ? (dir ? `${dir}/` : '') : rel;
      out.push({
        file: full,
        rel,
        path,
        slug: name,
        lang: dir === 'en' ? 'en' : 'he',
        url: `${ORIGIN}/${path}`,
        isErrorPage: name === '404.html',
      });
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

export function read(page) {
  return readFileSync(page.file, 'utf8');
}

/* ---------------------------------------------------------------- parsing */

const attrOf = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : null;
};

/** All <meta>/<link> tags as {tag, name, property, rel, href, content, hreflang}. */
export function headTags(html) {
  return [...html.matchAll(/<(meta|link)\b[^>]*>/gi)].map((m) => ({
    tag: m[0],
    kind: m[1].toLowerCase(),
    name: attrOf(m[0], 'name'),
    property: attrOf(m[0], 'property'),
    rel: attrOf(m[0], 'rel'),
    href: attrOf(m[0], 'href'),
    content: attrOf(m[0], 'content'),
    hreflang: attrOf(m[0], 'hreflang'),
  }));
}

export function title(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1].trim()) : null;
}

export function metaContent(html, key) {
  const tags = headTags(html);
  const hit = tags.find(
    (t) => (t.name && t.name.toLowerCase() === key) || (t.property && t.property.toLowerCase() === key),
  );
  return hit ? decode(hit.content ?? '') : null;
}

export function canonical(html) {
  const hit = headTags(html).find((t) => t.rel === 'canonical');
  return hit ? hit.href : null;
}

export function alternates(html) {
  return headTags(html)
    .filter((t) => t.rel === 'alternate' && t.hreflang)
    .map((t) => ({ hreflang: t.hreflang, href: t.href }));
}

export function isNoindex(html) {
  const robots = metaContent(html, 'robots') || '';
  return /noindex/i.test(robots);
}

export function headings(html) {
  const body = html.slice(html.search(/<body\b/i));
  return [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
    level: Number(m[1]),
    text: textOf(m[2]),
  }));
}

/** JSON-LD blocks, parsed. Returns {ok, data} | {ok:false, error} per block. */
export function jsonLd(html) {
  const blocks = [...html.matchAll(
    /<script[^>]+type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )];
  return blocks.map((m) => {
    try {
      return { ok: true, data: JSON.parse(m[1]) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

/** Flatten an @graph (or a bare node, or an array) into a node list. */
export function ldNodes(html) {
  const out = [];
  for (const block of jsonLd(html)) {
    if (!block.ok) continue;
    const push = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(push);
      out.push(n);
      if (n['@graph']) push(n['@graph']);
      for (const key of ['mainEntity', 'itemListElement', 'acceptedAnswer']) {
        if (n[key]) push(n[key]);
      }
    };
    push(block.data);
  }
  return out;
}

/** Internal hrefs from the body, excluding mailto/tel/external. */
export function internalLinks(html) {
  const body = html.slice(html.search(/<body\b/i));
  const hrefs = [...body.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"/gi)].map((m) => m[1]);
  return hrefs.filter((h) => h.startsWith('/') || h.startsWith(`${ORIGIN}/`));
}

/* ------------------------------------------------------------ normalising */

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&ndash;': '–', '&mdash;': '—', '&hellip;': '…',
};

export function decode(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? e);
}

export function textOf(html) {
  return decode(String(html ?? '').replace(/<[^>]*>/g, ' '));
}

/**
 * Whitespace- and entity-normalised comparison key.
 * Line-based greps miss phrases that wrap across lines; this is what makes a
 * JSON-LD answer match its visible copy reliably.
 */
export function norm(s) {
  return textOf(s)
    .replace(/[‎‏؜]/g, '')   // bidi marks
    .replace(/[‐-―־]/g, '-') // dash family incl. maqaf
    .replace(/["'“”‘’״]/g, '"')
    .replace(/\s+/g, ' ')
    // Stripping an inline tag leaves a space where the source had none:
    // `<a>…וההחזרים</a>.` becomes `וההחזרים .`. Collapse punctuation spacing
    // so a JSON-LD answer still matches copy that contains a link.
    .replace(/\s+([.,;:!?)\]»])/g, '$1')
    .replace(/([(\[«])\s+/g, '$1')
    .trim();
}

/* -------------------------------------------------------------- reporting */

export class Report {
  constructor() {
    this.items = [];
  }
  add(level, page, rule, message) {
    this.items.push({ level, page, rule, message });
  }
  error(page, rule, message) { this.add('error', page, rule, message); }
  warn(page, rule, message) { this.add('warn', page, rule, message); }

  get errors() { return this.items.filter((i) => i.level === 'error'); }
  get warnings() { return this.items.filter((i) => i.level === 'warn'); }

  print() {
    const byPage = new Map();
    for (const it of this.items) {
      if (!byPage.has(it.page)) byPage.set(it.page, []);
      byPage.get(it.page).push(it);
    }
    for (const [page, items] of [...byPage].sort()) {
      console.log(`\n${page}`);
      for (const it of items) {
        const mark = it.level === 'error' ? 'ERROR' : ' warn';
        console.log(`  ${mark}  ${it.rule.padEnd(22)} ${it.message}`);
      }
    }
    console.log(
      `\n${this.errors.length} error(s), ${this.warnings.length} warning(s) ` +
      `across ${byPage.size} page(s).`,
    );
  }
}
