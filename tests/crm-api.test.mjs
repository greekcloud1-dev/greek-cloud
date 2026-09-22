import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCrmHandler } from '../api/_lib/crm-api.js';
import { createAuthHandler } from '../api/_lib/auth.js';
import { createCronHandler, stuckDigest } from '../api/_lib/cron.js';
import { memoryStore } from '../api/_lib/store-memory.js';
import { signToken, verifyToken, SESSION_COOKIE, STATE_COOKIE } from '../api/_lib/session.js';
import { loadClients, INDEX_PATH } from '../api/_lib/clients.js';

const ORIGIN = 'https://greek-cloud.com';
const NOW = Date.parse('2026-09-23T09:00:00Z');
const env = {
  CRM_SESSION_SECRET: 's'.repeat(40),
  CRM_ADMIN_EMAIL: 'Boss@Gmail.com',
  GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret',
  CRON_SECRET: 'c'.repeat(24),
};
const ID1 = '2026-09-20T10-00-00-000Z-aaaaaaaaaaaaaaaa';
const ID2 = '2026-09-21T10-00-00-000Z-bbbbbbbbbbbbbbbb';

function seed() {
  return memoryStore({
    [`submissions/${ID1}/record.json`]: {
      submissionId: ID1, receivedAt: '2026-09-20T10:00:00.000Z', locale: 'he', plan: 'vip', fullName: 'דנה כהן',
      phone: '0501234567', email: 'd@x.com', passport: '12345678', city: 'כרתים', arrival: '2026-09-25',
      condition: 'כאבים', rxExists: 'no', consents: {},
    },
    [`submissions/${ID1}/prescription.pdf`]: '%PDF-1.4 test',
    [`submissions/${ID2}/record.json`]: {
      submissionId: ID2, receivedAt: '2026-09-21T10:00:00.000Z', locale: 'en', plan: 'standard', fullName: 'Avi Levi',
      phone: '+972 50 123 4567', email: 'a@x.com', passport: '87654321', city: 'Athens', arrival: '2026-11-01',
      condition: 'pain', rxExists: 'yes', consents: {},
    },
    [`submissions/${ID2}/NOTIFY-FAILED.json`]: { reason: 'x' },
    'crm/users.json': { users: [{ email: 'member@x.com', role: 'member' }] },
  });
}

const cookieFor = (email, exp = NOW / 1000 + 3600) => `${SESSION_COOKIE}=${signToken({ email, exp }, env.CRM_SESSION_SECRET)}`;

function req(path, { method = 'GET', body, cookie, origin = ORIGIN, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  if (origin && method === 'POST') h.origin = origin;
  if (body !== undefined) h['content-type'] = 'application/json';
  return new Request(`${ORIGIN}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}

function setup() {
  const store = seed();
  const handle = createCrmHandler({ env, store, now: () => NOW });
  return { store, handle };
}

test('not configured: 503 and nothing else', async () => {
  const handle = createCrmHandler({ env: {}, store: seed(), now: () => NOW });
  assert.equal((await handle(req('/api/crm?action=list'))).status, 503);
});

test('no session, forged session, expired session: 401', async () => {
  const { handle } = setup();
  assert.equal((await handle(req('/api/crm?action=list'))).status, 401);
  const forged = `${SESSION_COOKIE}=${signToken({ email: 'boss@gmail.com', exp: NOW / 1000 + 60 }, 'x'.repeat(40))}`;
  assert.equal((await handle(req('/api/crm?action=list', { cookie: forged }))).status, 401);
  assert.equal((await handle(req('/api/crm?action=list', { cookie: cookieFor('boss@gmail.com', NOW / 1000 - 1) }))).status, 401);
});

test('a valid session for someone no longer allowed is revoked', async () => {
  const { handle } = setup();
  const res = await handle(req('/api/crm?action=list', { cookie: cookieFor('gone@x.com') }));
  assert.equal(res.status, 401);
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
});

test('list returns merged clients, templates and who I am', async () => {
  const { handle, store } = setup();
  const res = await handle(req('/api/crm?action=list', { cookie: cookieFor('boss@gmail.com') }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const j = await res.json();
  assert.deepEqual(j.me, { email: 'boss@gmail.com', role: 'admin' });
  assert.equal(j.clients.length, 2);
  const dana = j.clients.find((c) => c.id === ID1);
  assert.deepEqual(dana.files, ['prescription.pdf']);
  assert.equal(dana.flightDate, '2026-09-25');
  assert.equal(j.templates.length, 4);
  assert.ok(store.files.has(INDEX_PATH), 'index cache written');
});

test('index cache: a second load reads only the index, and picks up changes', async () => {
  const { store } = setup();
  await loadClients(store);
  store.ops.get = 0;
  await loadClients(store);
  assert.equal(store.ops.get, 1, 'only the index');
  await store.putJSON(`submissions/${ID1}/crm.json`, { paid: true });
  store.ops.get = 0;
  const list = await loadClients(store);
  assert.equal(list.find((c) => c.id === ID1).paid, true);
  assert.equal(store.ops.get, 3, 'index + that one record + its crm.json');
});

test('patch: validates, writes crm.json, never touches record.json', async () => {
  const { handle, store } = setup();
  const before = store.files.get(`submissions/${ID1}/record.json`).body;
  const cookie = cookieFor('member@x.com');
  let res = await handle(req('/api/crm?action=patch', { method: 'POST', cookie, body: { id: ID1, patch: { paid: true, notes: 'שילם בביט' } } }));
  assert.equal(res.status, 200);
  const { client } = await res.json();
  assert.equal(client.paid, true);
  assert.equal(client.notes, 'שילם בביט');
  assert.equal(store.files.get(`submissions/${ID1}/record.json`).body, before);
  const crm = JSON.parse(store.files.get(`submissions/${ID1}/crm.json`).body);
  assert.equal(crm.history[0].by, 'member@x.com');

  res = await handle(req('/api/crm?action=patch', { method: 'POST', cookie, body: { id: ID1, patch: { fullName: 'x' } } }));
  assert.equal(res.status, 400);
  res = await handle(req('/api/crm?action=patch', { method: 'POST', cookie, body: { id: '../../crm/users', patch: { paid: true } } }));
  assert.equal(res.status, 400);
  res = await handle(req('/api/crm?action=patch', { method: 'POST', cookie, body: { id: '2026-09-22T10-00-00-000Z-cccccccccccccccc', patch: { paid: true } } }));
  assert.equal(res.status, 404);
});

test('patch retries on a concurrent write instead of overwriting it', async () => {
  const { store } = setup();
  const realPut = store.putJSON.bind(store);
  let raced = false;
  store.putJSON = async (path, data, opts) => {
    if (!raced && path.endsWith('crm.json')) {
      raced = true;
      await realPut(path, { contacted: true, stepsAt: {}, history: [] });
      return realPut(path, data, { ifMatch: '"stale"' });
    }
    return realPut(path, data, opts);
  };
  const handle = createCrmHandler({ env, store, now: () => NOW });
  const res = await handle(req('/api/crm?action=patch', { method: 'POST', cookie: cookieFor('boss@gmail.com'), body: { id: ID1, patch: { paid: true } } }));
  assert.equal(res.status, 200);
  const crm = JSON.parse(store.files.get(`submissions/${ID1}/crm.json`).body);
  assert.equal(crm.contacted, true, 'the other write survived');
  assert.equal(crm.paid, true);
});

test('POST from another origin is refused even with a valid cookie', async () => {
  const { handle } = setup();
  const res = await handle(req('/api/crm?action=patch', { method: 'POST', cookie: cookieFor('boss@gmail.com'), origin: 'https://evil.example', body: { id: ID1, patch: { paid: true } } }));
  assert.equal(res.status, 403);
});

test('create a manual client', async () => {
  const { handle, store } = setup();
  const res = await handle(req('/api/crm?action=create', { method: 'POST', cookie: cookieFor('member@x.com'), body: { client: { fullName: 'רון', phone: '0529998888', contacted: true } } }));
  assert.equal(res.status, 200);
  const { client } = await res.json();
  assert.equal(client.entry, 'manual');
  assert.equal(client.contacted, true);
  assert.ok(store.files.has(`submissions/${client.id}/record.json`));
  const bad = await handle(req('/api/crm?action=create', { method: 'POST', cookie: cookieFor('member@x.com'), body: { client: { phone: '0529998888' } } }));
  assert.equal(bad.status, 400);
});

test('file: streamed with auth only, PDFs download, names are fixed', async () => {
  const { handle } = setup();
  const cookie = cookieFor('member@x.com');
  const ok = await handle(req(`/api/crm?action=file&id=${ID1}&name=prescription.pdf`, { cookie }));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-disposition'), /^attachment/);
  assert.equal(await ok.text(), '%PDF-1.4 test');
  assert.equal((await handle(req(`/api/crm?action=file&id=${ID1}&name=record.json`, { cookie }))).status, 400);
  assert.equal((await handle(req(`/api/crm?action=file&id=${ID1}&name=../x.pdf`, { cookie }))).status, 400);
  assert.equal((await handle(req(`/api/crm?action=file&id=${ID1}&name=prescription.pdf`))).status, 401);
});

test('admin only: delete, export, users', async () => {
  const { handle, store } = setup();
  const member = cookieFor('member@x.com');
  const admin = cookieFor('boss@gmail.com');
  for (const [action, method, body] of [['delete', 'POST', { id: ID1 }], ['export', 'POST', { ids: [ID1] }], ['users', 'GET'], ['users', 'POST', { users: [] }]]) {
    const res = await handle(req(`/api/crm?action=${action}`, { method, cookie: member, body }));
    assert.equal(res.status, 403, `${method} ${action}`);
  }

  const csv = await handle(req('/api/crm?action=export', { method: 'POST', cookie: admin, body: { ids: [ID1, ID2], medical: false } }));
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const text = await csv.text();
  assert.match(text, /דנה כהן/);
  assert.doesNotMatch(text, /12345678|כאבים/);

  const users = await handle(req('/api/crm?action=users', { method: 'POST', cookie: admin, body: { users: [{ email: 'new@x.com' }] } }));
  assert.equal(users.status, 200);
  assert.equal((await handle(req('/api/crm?action=list', { cookie: member }))).status, 401, 'removed member is out at once');
  assert.equal((await handle(req('/api/crm?action=list', { cookie: cookieFor('new@x.com') }))).status, 200);

  const del = await handle(req('/api/crm?action=delete', { method: 'POST', cookie: admin, body: { id: ID1 } }));
  assert.equal(del.status, 200);
  assert.equal([...store.files.keys()].filter((k) => k.includes(ID1)).length, 0);
});

test('templates: any user may save, validated', async () => {
  const { handle } = setup();
  const cookie = cookieFor('member@x.com');
  const res = await handle(req('/api/crm?action=templates', { method: 'POST', cookie, body: { templates: [{ title: 'שלום', text: 'היי {שם}' }] } }));
  assert.equal(res.status, 200);
  const list = await (await handle(req('/api/crm?action=list', { cookie }))).json();
  assert.equal(list.templates[0].title, 'שלום');
  const bad = await handle(req('/api/crm?action=templates', { method: 'POST', cookie, body: { templates: 'x' } }));
  assert.equal(bad.status, 400);
});

/* ---------- Google sign-in ---------- */

function idToken(claims) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'RS256' })}.${b(claims)}.sig`;
}

function authSetup(claims, { ok = true } = {}) {
  const store = seed();
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: String(opts.body) });
    return new Response(JSON.stringify({ id_token: idToken(claims) }), { status: ok ? 200 : 400 });
  };
  return { handle: createAuthHandler({ env, store, fetchImpl, now: () => NOW }), calls };
}

const goodClaims = { iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, exp: NOW / 1000 + 300, email: 'boss@gmail.com', email_verified: true };

test('sign-in start redirects to Google with a state cookie', async () => {
  const { handle } = authSetup(goodClaims);
  const res = await handle(req('/api/crm-auth'));
  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get('location'));
  assert.equal(loc.host, 'accounts.google.com');
  assert.equal(loc.searchParams.get('redirect_uri'), `${ORIGIN}/api/crm-auth`);
  assert.equal(loc.searchParams.get('scope'), 'openid email');
  const state = loc.searchParams.get('state');
  assert.match(res.headers.get('set-cookie'), new RegExp(`${STATE_COOKIE}=${state};.*SameSite=Lax`));
});

test('callback: good token for an allowed email sets a session', async () => {
  const { handle, calls } = authSetup(goodClaims);
  const res = await handle(req('/api/crm-auth?code=abc&state=st1', { cookie: `${STATE_COOKIE}=st1` }));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/crm/');
  const cookies = res.headers.getSetCookie();
  const session = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Strict/);
  const token = session.split(';')[0].split('=').slice(1).join('=');
  assert.equal(verifyToken(token, env.CRM_SESSION_SECRET, NOW).email, 'boss@gmail.com');
  assert.match(calls[0].body, /client_secret=secret/);
});

test('callback refuses: bad state, wrong audience, unverified email, stranger', async () => {
  const cases = [
    [goodClaims, `${STATE_COOKIE}=other`, 'state'],
    [{ ...goodClaims, aud: 'someone-else' }, `${STATE_COOKIE}=st1`, 'google'],
    [{ ...goodClaims, email_verified: false }, `${STATE_COOKIE}=st1`, 'google'],
    [{ ...goodClaims, exp: NOW / 1000 - 5 }, `${STATE_COOKIE}=st1`, 'google'],
    [{ ...goodClaims, email: 'stranger@gmail.com' }, `${STATE_COOKIE}=st1`, 'denied'],
  ];
  for (const [claims, cookie, code] of cases) {
    const { handle } = authSetup(claims);
    const res = await handle(req('/api/crm-auth?code=abc&state=st1', { cookie }));
    assert.equal(res.headers.get('location'), `/crm/?e=${code}`);
    assert.ok(!res.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`)));
  }
});

/* ---------- daily alert ---------- */

test('cron: needs the secret, sends a short digest without medical data', async () => {
  const store = seed();
  const sent = [];
  const handle = createCronHandler({ env, store, now: () => NOW, notify: async (_e, d) => { sent.push(d); return { email: 'sent' }; } });
  assert.equal((await handle(new Request(`${ORIGIN}/api/crm-cron`))).status, 401);
  const res = await handle(new Request(`${ORIGIN}/api/crm-cron`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }));
  const j = await res.json();
  assert.equal(j.stuck, 2);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /דנה כ\./);
  assert.doesNotMatch(sent[0].text, /כאבים|12345678|0501234567/);
  assert.equal(sent[0].url, 'https://greek-cloud.com/crm/?f=stuck');
});

test('cron: silent when nobody is stuck', () => {
  assert.equal(stuckDigest([], NOW), null);
});
