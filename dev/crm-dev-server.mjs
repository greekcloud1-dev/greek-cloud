/* Local preview of the CRM with made-up clients. Never deployed (.vercelignore).
   npm run crm:dev  ->  http://localhost:8787/crm/  (signs you in as the admin) */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCrmHandler } from '../api/_lib/crm-api.js';
import { memoryStore } from '../api/_lib/store-memory.js';
import { signToken, cookie, SESSION_COOKIE } from '../api/_lib/session.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const env = { CRM_SESSION_SECRET: 'dev-secret-dev-secret-dev-secret-00', CRM_ADMIN_EMAIL: 'greekcloud1@gmail.com' };
const vercel = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
const crmCsp = vercel.headers.find((h) => h.source === '/crm(.*)').headers.find((h) => h.key === 'Content-Security-Policy').value;

const DAY = 86400000;
const iso = (d) => new Date(Date.now() + d * DAY).toISOString();
const day = (d) => iso(d).slice(0, 10);
let n = 0;
const id = (d) => `${iso(d).replace(/[:.]/g, '-')}-${(++n).toString(16).padStart(16, 'a')}`;
const people = [
  { fullName: 'דנה כהן', phone: '050-1234567', city: 'כרתים', plan: 'vip', arrival: day(2), received: -3, condition: 'כאבי גב כרוניים אחרי פריצת דיסק. ניסיתי פיזיותרפיה ונוגדי דלקת.', rxExists: 'past', rx: true, source: 'google' },
  { fullName: 'אבי לוי', phone: '+972 52 765 4321', city: 'אתונה', plan: 'standard', arrival: day(5), received: -6, condition: 'נדודי שינה ומיגרנות.', rxExists: 'no', crm: { contacted: true, paid: true }, source: 'instagram' },
  { fullName: 'מיכל ברק', phone: '054-2223333', city: 'רודוס', plan: 'standard', arrival: day(12), received: -0.1, condition: 'פיברומיאלגיה.', rxExists: 'yes', source: 'ai' },
  { fullName: 'John Smith', phone: '+44 7700 900123', city: 'Santorini', plan: 'vip', arrival: day(20), received: -1.5, condition: 'Chronic neuropathic pain.', rxExists: 'yes', locale: 'en', source: 'direct' },
  { fullName: 'רונית שמש', phone: '052-4445555', city: 'מיקונוס', plan: 'standard', arrival: day(34), received: -2, condition: 'קרוהן.', rxExists: 'no', crm: { contacted: true }, source: 'facebook' },
  { fullName: 'יוסי אברהם', phone: '053-6667777', city: 'אחר / עדיין לא ידוע', plan: 'standard', arrival: '', arrivalUnknown: true, received: -4, condition: 'כאבים אחרי ניתוח.', rxExists: 'no', crm: { contacted: true }, source: 'google' },
  { fullName: 'שרה גולן', phone: '050-8889999', city: 'קורפו', plan: 'vip', arrival: day(-10), received: -30, condition: 'טרשת נפוצה.', rxExists: 'yes', crm: { contacted: true, paid: true, rxIssued: true }, source: 'friend' },
  { fullName: 'דני רוזן', phone: '058-1112222', city: 'סלוניקי', plan: 'standard', arrival: day(40), received: -9, condition: 'כאבי ברכיים.', rxExists: 'no', crm: { lost: { reason: 'expensive', note: 'אמר שיחזור בשנה הבאה', at: iso(-5) } }, source: 'google' },
  { fullName: 'דנה כהן', phone: '+972501234567', city: 'כרתים', plan: 'standard', arrival: day(-200), received: -220, condition: 'כאבי גב.', rxExists: 'no', crm: { contacted: true, paid: true, rxIssued: true }, source: 'google' },
  { fullName: 'תמר נחום', phone: '054-9990000', city: 'קוס', plan: 'standard', arrival: day(65), received: -1, condition: 'חרדה ומתח.', rxExists: 'no', manual: true, crm: { contacted: true, notes: 'הגיעה דרך המלצה של אבי' }, source: 'friend' },
];
const seed = {};
for (const p of people) {
  const sid = id(p.received);
  seed[`submissions/${sid}/record.json`] = {
    submissionId: sid, receivedAt: iso(p.received), locale: p.locale || 'he', plan: p.plan, fullName: p.fullName,
    passport: String(10000000 + Math.floor(Math.random() * 89999999)), birthdate: '1988-05-17', age: 38,
    email: `${p.phone.replace(/\D/g, '').slice(-4)}@example.com`, phone: p.phone, city: p.city, arrival: p.arrival,
    arrivalUnknown: !!p.arrivalUnknown, condition: p.condition, rxExists: p.rxExists, source: p.source,
    entry: p.manual ? 'manual' : undefined,
    consents: { c_age: true, c_terms: true, c_health: true, c_customs: true, c_nopromise: true, c_accuracy: true, c_liability: true },
  };
  if (p.crm) seed[`submissions/${sid}/crm.json`] = { ...p.crm, seenAt: iso(p.received + 0.01), stepsAt: {}, history: [] };
  if (p.rx) seed[`submissions/${sid}/prescription.pdf`] = '%PDF-1.4 dev';
}
const store = memoryStore(seed);
const handle = createCrmHandler({ env, store });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

async function toRequest(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : body });
}

async function send(res, response) {
  const headers = {};
  response.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers['set-cookie'] = cookies;
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === '/api/crm') return send(res, await handle(await toRequest(req)));
    if (url.pathname === '/api/crm-auth') {
      const token = signToken({ email: env.CRM_ADMIN_EMAIL, exp: Math.floor(Date.now() / 1000) + 86400 }, env.CRM_SESSION_SECRET);
      res.writeHead(302, { location: '/crm/', 'set-cookie': cookie(SESSION_COOKIE, token, { maxAge: 86400 }) });
      return res.end();
    }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    const headers = { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' };
    if (url.pathname.startsWith('/crm/')) headers['content-security-policy'] = crmCsp;
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, () => console.log(`CRM dev: http://localhost:${PORT}/crm/`));
