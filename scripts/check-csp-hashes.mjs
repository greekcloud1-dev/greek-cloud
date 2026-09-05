/* ==========================================================================
   node scripts/check-csp-hashes.mjs
   ==========================================================================

   The Content-Security-Policy in vercel.json names the inline scripts it
   trusts by SHA-256 hash instead of opening the page up with 'unsafe-inline'.
   That is the strong version of the policy, and it has one failure mode: edit
   the pre-paint snippet in a page by a single byte and the browser silently
   refuses to run it. Nothing throws, no test goes red -- the theme just
   flashes white on load for every visitor.

   So the hashes are checked rather than remembered. This walks every shipped
   HTML file, hashes each inline script a browser would actually execute, and
   fails if one is not covered by the policy.

   Data blocks (application/ld+json) are skipped on purpose: the HTML spec
   classifies them before the CSP check runs, so they are never executed and
   never need a hash. Speculation rules ARE checked against script-src, so
   they are included.

   Run it after touching any <script> block or the CSP:  npm run check:csp
   ========================================================================== */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function htmlFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules' || entry === '_build') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) htmlFiles(path, out);
    else if (path.endsWith('.html')) out.push(path);
  }
  return out;
}

const csp = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
  .headers.flatMap((group) => group.headers)
  .find((header) => header.key === 'Content-Security-Policy');

if (!csp) {
  console.error('FAIL  vercel.json has no Content-Security-Policy header.');
  process.exit(1);
}

const scriptSrc = (csp.value.split(';').find((d) => d.trim().startsWith('script-src')) || '').trim();
if (!scriptSrc) {
  console.error('FAIL  the CSP has no script-src directive.');
  process.exit(1);
}

// A single 'unsafe-inline' undoes every hash below it, so it is treated as a
// failure rather than quietly making this check meaningless.
for (const keyword of ["'unsafe-inline'", "'unsafe-eval'"]) {
  if (scriptSrc.includes(keyword)) {
    console.error(`FAIL  script-src contains ${keyword}, which defeats the hashes.`);
    process.exit(1);
  }
}

const INLINE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const problems = [];
let checked = 0;

for (const file of htmlFiles(root)) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(INLINE)) {
    const attrs = match[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = (attrs.match(/type\s*=\s*"([^"]*)"/i) || [, ''])[1].toLowerCase();
    const executed = !type || type === 'text/javascript' || type === 'module' || type === 'speculationrules';
    if (!executed) continue;

    checked++;
    const hash = `'sha256-${createHash('sha256').update(match[2], 'utf8').digest('base64')}'`;
    if (!scriptSrc.includes(hash)) {
      problems.push(`${relative(root, file)}  type="${type || '(none)'}"  needs ${hash}`);
    }
  }
}

if (problems.length) {
  console.error(`FAIL  ${problems.length} of ${checked} inline scripts are not covered by the CSP:`);
  for (const problem of [...new Set(problems)]) console.error('      ' + problem);
  console.error('\n      Add the hash to script-src in vercel.json, or the browser will refuse to run it.');
  process.exit(1);
}

console.log(`OK  all ${checked} executable inline scripts are covered by the CSP hashes.`);
