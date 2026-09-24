import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeClient, businessDeadline, replyDeadline, stuckReasons, rxValidUntil, upgradeCandidate,
  reviewCandidate, formMissing, retentionDue, matchesQuery, shortRef, fillTemplate, mergeTemplates,
  doctorText, verifyText, copyText, sanitizePatch, applyPatch, relatedMap, timeLabel, DEFAULT_TEMPLATES, sanitizeTemplates,
} from '../crm/core.js';
import { createCrmHandler } from '../api/_lib/crm-api.js';
import { stuckDigest } from '../api/_lib/cron.js';
import { memoryStore } from '../api/_lib/store-memory.js';
import { signToken, SESSION_COOKIE } from '../api/_lib/session.js';
import { INDEX_PATH, loadClients } from '../api/_lib/clients.js';

const DAY = 86400000;
// Israel is UTC+3 in late September 2026. 2026-09-23 is a Wednesday.
const il = (iso) => Date.parse(`${iso}+03:00`);
const NOW = il('2026-09-23T12:00:00');
const ID = '2026-09-20T10-00-00-000Z-aaaaaaaa3ff9bf5c';

function client(over = {}, crm = {}) {
  const record = {
    submissionId: ID, receivedAt: new Date(NOW - 2 * DAY).toISOString(), locale: 'he', plan: 'standard',
    fullName: 'DANA COHEN', phone: '050-1234567', email: 'd@example.com', passport: '12345678',
    birthdate: '1990-03-14', city: 'כרתים', arrival: '2026-10-03', condition: 'כאבי גב', rxExists: 'past',
    consents: { c_age: true }, ...over,
  };
  return mergeClient(over.submissionId || ID, record, crm, []);
}

/* ---------- reply clock ---------- */

test('VIP reply clock counts only published reply hours', () => {
  const at = (iso) => new Date(businessDeadline(il(iso), 60)).toISOString();
  assert.equal(at('2026-09-23T12:00:00'), new Date(il('2026-09-23T13:00:00')).toISOString(), 'weekday, inside hours');
  assert.equal(at('2026-09-23T18:30:00'), new Date(il('2026-09-24T10:30:00')).toISOString(), 'rolls into next morning');
  assert.equal(at('2026-09-23T23:00:00'), new Date(il('2026-09-24T11:00:00')).toISOString(), 'night: starts at 10:00');
  assert.equal(at('2026-09-25T12:30:00'), new Date(il('2026-09-27T10:30:00')).toISOString(), 'Friday 12:30 -> Sunday, Saturday skipped');
  assert.equal(at('2026-09-26T15:00:00'), new Date(il('2026-09-27T11:00:00')).toISOString(), 'Saturday -> Sunday 11:00');
  assert.equal(timeLabel(il('2026-09-24T11:00:00'), NOW), 'מחר 11:00');
});

test('VIP waiting past its hour is stuck as vip_reply; Standard keeps 24h', () => {
  const vipLate = client({ plan: 'vip', receivedAt: new Date(il('2026-09-23T09:00:00')).toISOString(), arrival: '2026-11-20' });
  assert.deepEqual(stuckReasons(vipLate, NOW), ['vip_reply']);
  const vipFresh = client({ plan: 'vip', receivedAt: new Date(il('2026-09-23T11:30:00')).toISOString(), arrival: '2026-11-20' });
  assert.deepEqual(stuckReasons(vipFresh, NOW), []);
  assert.equal(replyDeadline(vipFresh), il('2026-09-23T12:30:00'));
  const std = client({ receivedAt: new Date(NOW - 20 * 3600000).toISOString(), arrival: '2026-11-20' });
  assert.deepEqual(stuckReasons(std, NOW), []);
  assert.equal(replyDeadline(client({}, { contacted: true })), null);
});

test('unpaid window depends on the plan', () => {
  const in6 = '2026-09-29';
  assert.ok(stuckReasons(client({ arrival: in6 }, { contacted: true }), NOW).includes('unpaid_soon'), 'Standard: 9 days');
  assert.ok(!stuckReasons(client({ plan: 'vip', arrival: in6 }, { contacted: true }), NOW).includes('unpaid_soon'), 'VIP: 3 days');
});

/* ---------- reference lookup ---------- */

test('search finds the short reference, and a reference never matches phones', () => {
  const c = client();
  assert.equal(shortRef(ID), '3FF9BF5C');
  assert.ok(matchesQuery(c, '3ff9bf5c'));
  assert.ok(matchesQuery(c, ' 3FF9 BF5C '));
  const other = client({ submissionId: '2026-09-20T10-00-00-000Z-bbbbbbbbbbbbbbbb', phone: '053-9500000' });
  assert.ok(!matchesQuery(other, '3FF9BF5C'), 'digits 395 must not match a phone');
  assert.ok(matchesQuery(c, '050-1234567'));
  assert.match(copyText(c), /פנייה 3FF9BF5C/);
});

/* ---------- identity correction ---------- */

test('corrected name/passport flow into copy, search, doctor packet and duplicates; the form value stays', () => {
  const c = client({}, { fullName: 'DANA COHEN-LEVI', passport: '87654321' });
  assert.equal(c.fullName, 'DANA COHEN-LEVI');
  assert.equal(c.formFullName, 'DANA COHEN');
  assert.equal(c.formPassport, '12345678');
  assert.match(copyText(c), /דרכון: 87654321/);
  assert.ok(matchesQuery(c, '12345678'), 'old number still finds the client');
  const doc = doctorText(c, '2026-09-23');
  assert.match(doc, /Full name \(as in passport\): DANA COHEN-LEVI/);
  assert.match(doc, /Passport no\.: 87654321/);
  assert.match(doc, /City in Greece: Crete/);
  assert.match(doc, /Arrival in Greece: 03\/10\/2026/);
  assert.match(doc, /Existing Israeli cannabis prescription\/licence: In the past/);
  assert.match(doc, /Medical condition \(patient's own words\):\nכאבי גב/);
  assert.match(verifyText(c), /מספר דרכון: 8765 4321/);
  const twin = client({ submissionId: '2026-09-01T10-00-00-000Z-cccccccccccccccc', phone: '052-0000000', passport: '87654321' });
  assert.deepEqual(relatedMap([c, twin]).get(ID), [twin.id]);
});

test('patch validation and history for the new fields', () => {
  assert.equal(sanitizePatch({ passport: '1234' }).ok, false);
  assert.equal(sanitizePatch({ fullName: 'x' }).ok, false);
  assert.equal(sanitizePatch({ plan: 'gold' }).ok, false);
  assert.equal(sanitizePatch({ refund: 'maybe' }).ok, false);
  assert.equal(sanitizePatch({ review: { text: 'x'.repeat(1501) } }).ok, false);
  assert.equal(sanitizePatch({ review: { rating: 5 } }).ok, false);
  const t = '2026-09-23T09:00:00.000Z';
  let crm = applyPatch({}, { verified: true, plan: 'vip', refund: 'owed' }, 'a@x.com', t);
  assert.deepEqual(crm.verified, { by: 'a@x.com', at: t });
  assert.equal(crm.plan, 'vip');
  assert.deepEqual(crm.refund, { status: 'owed', at: t });
  crm = applyPatch(crm, { refund: 'done' }, 'b@x.com', '2026-09-24T09:00:00.000Z');
  assert.equal(crm.refund.at, t, 'owed date is kept');
  assert.equal(crm.refund.doneAt, '2026-09-24T09:00:00.000Z');
  crm = applyPatch(crm, { review: { asked: true } }, 'a@x.com', t);
  crm = applyPatch(crm, { review: { text: 'שירות מעולה', consent: true } }, 'a@x.com', t);
  assert.equal(crm.review.askedAt, t);
  assert.deepEqual(crm.review.consent, { at: t, by: 'a@x.com' });
  assert.equal(crm.history.find((h) => h.field === 'review').value, 'consent');
  assert.ok(!JSON.stringify(crm.history).includes('שירות מעולה'), 'review words never land in history');
});

/* ---------- prescription validity, refunds ---------- */

test('prescription validity: 30 days from issue, warns when the flight is at or past expiry', () => {
  const issued = new Date(il('2026-09-10T12:00:00')).toISOString();
  const ok = client({ arrival: '2026-09-28' }, { contacted: true, paid: true, rxIssued: true, stepsAt: { rxIssued: issued } });
  assert.equal(rxValidUntil(ok), '2026-10-10');
  assert.ok(!stuckReasons(ok, NOW).includes('rx_expires'));
  const late = client({ arrival: '2026-10-09' }, { contacted: true, paid: true, rxIssued: true, stepsAt: { rxIssued: issued } });
  assert.ok(stuckReasons(late, NOW).includes('rx_expires'));
});

test('refund owed stays stuck even when not relevant; paid, flown, no Rx, no refund is flagged', () => {
  const owed = client({}, { paid: true, lost: { reason: 'physician_declined', at: new Date(NOW).toISOString() }, refund: { status: 'owed', at: new Date(NOW).toISOString() } });
  assert.deepEqual(stuckReasons(owed, NOW), ['refund_due']);
  assert.equal(retentionDue(owed, NOW + 200 * DAY), false, 'never due while money is owed');
  const orphan = client({ arrival: '2026-09-15' }, { contacted: true, paid: true });
  assert.deepEqual(stuckReasons(orphan, NOW), ['paid_no_rx']);
});

/* ---------- upgrade, review, manual form ---------- */

test('VIP offer only for Standard without Rx flying within a week', () => {
  assert.ok(upgradeCandidate(client({ arrival: '2026-09-27' }), NOW));
  assert.ok(!upgradeCandidate(client({ arrival: '2026-10-10' }), NOW));
  assert.ok(!upgradeCandidate(client({ plan: 'vip', arrival: '2026-09-27' }), NOW));
  assert.ok(!upgradeCandidate(client({ arrival: '2026-09-27' }, { plan: 'vip' }), NOW), 'follows the corrected plan');
});

test('review candidates: back 2-10 days with an Rx, not asked yet', () => {
  const base = { rxIssued: true, stepsAt: { rxIssued: new Date(NOW - 20 * DAY).toISOString() } };
  assert.ok(reviewCandidate(client({ arrival: '2026-09-18' }, base), NOW));
  assert.ok(!reviewCandidate(client({ arrival: '2026-09-22' }, base), NOW), 'too soon');
  assert.ok(!reviewCandidate(client({ arrival: '2026-09-01' }, base), NOW), 'too late');
  assert.ok(!reviewCandidate(client({ arrival: '2026-09-18' }, { ...base, review: { askedAt: 'x' } }), NOW));
});

test('manual clients are flagged until a web form arrives for the same person', () => {
  const manual = client({ entry: 'manual', submissionId: '2026-09-22T10-00-00-000Z-dddddddddddddddd' });
  const web = client({ submissionId: '2026-09-23T08-00-00-000Z-eeeeeeeeeeeeeeee' });
  assert.ok(formMissing(manual, []));
  assert.ok(!formMissing(manual, [web]));
  assert.ok(!formMissing(web, []));
});

/* ---------- retention clock ---------- */

test('retention: 90 days after the latest closing event, 120 after entry for leads with nothing else', () => {
  const rx = client({ arrival: '2026-06-10' }, { rxIssued: true, stepsAt: { rxIssued: new Date(NOW - 95 * DAY).toISOString() } });
  assert.ok(retentionDue(rx, NOW));
  const recentLost = client({ arrival: '2026-05-01' }, { lost: { reason: 'no_answer', at: new Date(NOW - 10 * DAY).toISOString() } });
  assert.ok(!retentionDue(recentLost, NOW), 'a recent close restarts the clock');
  const erase = client({}, { lost: { reason: 'erase_request', at: new Date(NOW).toISOString() } });
  assert.ok(retentionDue(erase, NOW), 'erase request is due at once');
  const cold = client({ arrival: '', receivedAt: new Date(NOW - 125 * DAY).toISOString() });
  assert.ok(retentionDue(cold, NOW));
});

/* ---------- templates ---------- */

test('templates fill price, payment details and reference; saved sets still get new built-ins', () => {
  const vip = client({ plan: 'vip' });
  const pay = DEFAULT_TEMPLATES.find((t) => t.id === 'payment').text;
  const out = fillTemplate(pay, vip, { paymentDetails: 'ביט: 050-0000000' });
  assert.match(out, /379 ₪/);
  assert.match(out, /ביט: 050-0000000/);
  assert.doesNotMatch(fillTemplate(pay, vip, {}), /\n\n\n|\{פרטי_תשלום\}/, 'no hole when details are missing');
  assert.equal(fillTemplate('#{מספר_פנייה}', vip), '#3FF9BF5C');
  const merged = mergeTemplates([{ id: 'welcome', title: 'שלום', text: 'x' }], ['goodbye']);
  assert.equal(merged[0].title, 'שלום');
  assert.ok(merged.some((t) => t.id === 'review'));
  assert.ok(!merged.some((t) => t.id === 'goodbye'), 'a deleted built-in stays deleted');
});

/* ---------- API ---------- */

const env = { CRM_SESSION_SECRET: 's'.repeat(40), CRM_ADMIN_EMAIL: 'boss@gmail.com' };
const ORIGIN = 'https://greek-cloud.com';
const cookieFor = (email) => `${SESSION_COOKIE}=${signToken({ email, exp: NOW / 1000 + 3600 }, env.CRM_SESSION_SECRET)}`;
function req(path, { method = 'GET', body, cookie } = {}) {
  const headers = { cookie };
  if (method === 'POST') { headers.origin = ORIGIN; headers['content-type'] = 'application/json'; }
  return new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
function seed() {
  return memoryStore({
    [`submissions/${ID}/record.json`]: {
      submissionId: ID, receivedAt: '2026-09-20T10:00:00.000Z', plan: 'standard', fullName: 'DANA COHEN',
      phone: '0501234567', passport: '12345678', city: 'כרתים', arrival: '2026-09-18', condition: 'כאבים',
    },
    [`submissions/${ID}/NOTIFY-FAILED.json`]: { reason: 'x' },
    'crm/users.json': { users: [{ email: 'member@x.com', role: 'member' }] },
  });
}

test('failed alert files mark the client and are never offered as a download', async () => {
  const store = seed();
  const [c] = await loadClients(store);
  assert.deepEqual(c.notifyFailed, ['email']);
  assert.deepEqual(c.files, []);
});

test('payment details: anyone reads, only the admin writes', async () => {
  const store = seed();
  const handle = createCrmHandler({ env, store, now: () => NOW });
  const denied = await handle(req('/api/crm?action=settings', { method: 'POST', cookie: cookieFor('member@x.com'), body: { paymentDetails: 'x' } }));
  assert.equal(denied.status, 403);
  const ok = await handle(req('/api/crm?action=settings', { method: 'POST', cookie: cookieFor('boss@gmail.com'), body: { paymentDetails: 'ביט 050' } }));
  assert.equal(ok.status, 200);
  const list = await (await handle(req('/api/crm?action=list', { cookie: cookieFor('member@x.com') }))).json();
  assert.equal(list.settings.paymentDetails, 'ביט 050');
  assert.equal(list.templates.length, 7);
});

test('a consented review survives the client being deleted; only safe fields are kept', async () => {
  const store = seed();
  const handle = createCrmHandler({ env, store, now: () => NOW });
  const admin = cookieFor('boss@gmail.com');
  const patch = (p) => handle(req('/api/crm?action=patch', { method: 'POST', cookie: admin, body: { id: ID, patch: p } }));
  assert.equal((await patch({ review: { text: 'היה מצוין', displayName: 'דנה', consent: true } })).status, 200);
  await loadClients(store);
  assert.ok(store.files.has(INDEX_PATH));
  const del = await handle(req('/api/crm?action=delete', { method: 'POST', cookie: admin, body: { id: ID } }));
  assert.equal(del.status, 200);
  const idx = JSON.parse(store.files.get(INDEX_PATH).body);
  assert.ok(!(ID in idx.entries), 'deleted client leaves the index cache at once');
  const reviews = await (await handle(req('/api/crm?action=reviews', { cookie: admin }))).json();
  assert.equal(reviews.reviews.length, 1);
  const r = reviews.reviews[0];
  assert.equal(r.text, 'היה מצוין');
  assert.equal(r.displayName, 'דנה');
  assert.equal(r.city, 'כרתים');
  assert.ok(!('passport' in r) && !JSON.stringify(r).includes('כאבים'));
  // withdrawing consent removes it
  const store2 = seed();
  const h2 = createCrmHandler({ env, store: store2, now: () => NOW });
  const p2 = (p) => h2(req('/api/crm?action=patch', { method: 'POST', cookie: admin, body: { id: ID, patch: p } }));
  await p2({ review: { text: 'טוב', consent: true } });
  await p2({ review: { consent: false } });
  assert.equal(JSON.parse(store2.files.get('crm/reviews.json').body).reviews.length, 0);
  assert.equal((await h2(req('/api/crm?action=reviews', { cookie: cookieFor('member@x.com') }))).status, 403);
});

test('morning digest: waiting leads with time left, VIP first, counted once', () => {
  const vip = client({ plan: 'vip', fullName: 'Avi Levi', submissionId: '2026-09-23T08-00-00-000Z-ffffffffffffffff', receivedAt: new Date(il('2026-09-23T11:30:00')).toISOString(), arrival: '2026-09-25' });
  const std = client({ receivedAt: new Date(NOW - 30 * 3600000).toISOString() });
  const d = stuckDigest([std, vip], NOW);
  const lines = d.text.split('\n');
  assert.equal(lines[0], 'ממתינים למענה ראשון:');
  assert.match(lines[1], /^• Avi L\. · VIP · להשיב עד 12:30$/);
  assert.match(lines[2], /^• DANA C\. · באיחור של/);
  assert.equal(d.count, 2);
});

/* ---------- fixes from the adversarial review ---------- */

test('review consent is withdrawn when the approved words or name change', () => {
  const t = '2026-09-23T09:00:00.000Z';
  let crm = applyPatch({}, { review: { text: 'טוב מאוד', displayName: 'ד.', consent: true } }, 'a@x.com', t);
  assert.ok(crm.review.consent);
  crm = applyPatch(crm, { review: { text: 'טוב מאוד', displayName: 'ד.' } }, 'a@x.com', t);
  assert.ok(crm.review.consent, 'same words keep consent');
  crm = applyPatch(crm, { review: { text: 'טוב מאוד, עזר לי עם הקרוהן' } }, 'a@x.com', t);
  assert.equal(crm.review.consent, null);
  assert.equal(crm.history[0].value, 'unconsent');
});

test('correcting identity clears the verified tick and keeps passport numbers out of history', () => {
  const t = '2026-09-23T09:00:00.000Z';
  let crm = applyPatch({}, { verified: true }, 'a@x.com', t);
  crm = applyPatch(crm, { passport: '87654321' }, 'b@x.com', t);
  assert.equal(crm.verified, null);
  assert.ok(!JSON.stringify(crm.history).includes('87654321'));
  crm = applyPatch(crm, { fullName: 'DANA LEVI', verified: true }, 'b@x.com', t);
  assert.ok(crm.verified, 'correct-and-verify in one step keeps the tick');
});

test('VIP offer skips paid clients and stops once sent; erase request waits for an owed refund', () => {
  assert.ok(!upgradeCandidate(client({ arrival: '2026-09-27' }, { paid: true }), NOW));
  assert.ok(!upgradeCandidate(client({ arrival: '2026-09-27' }, { upgradeOfferedAt: 'x' }), NOW));
  const both = client({}, { lost: { reason: 'erase_request', at: 'x' }, refund: { status: 'owed', at: 'x' } });
  assert.equal(retentionDue(both, NOW), false);
});

test('reference search accepts "#REF" and the customer\'s own line', () => {
  const c = client();
  assert.ok(matchesQuery(c, '#3FF9BF5C'));
  assert.ok(matchesQuery(c, 'מספר פנייה: 3FF9BF5C'));
});

test('templates: a phase-1 save keeps deleted built-ins deleted; new rows never reuse an id', () => {
  const merged = mergeTemplates([{ id: 'welcome', title: 'a', text: 'b' }, { id: 'payment', title: 'a', text: 'b' }, { id: 'reminder', title: 'a', text: 'b' }], undefined);
  assert.ok(!merged.some((t) => t.id === 'goodbye'), 'goodbye was deleted in phase 1');
  assert.ok(merged.some((t) => t.id === 'review'), 'phase-2 built-ins still arrive');
  const clean = sanitizeTemplates([{ id: 'review', title: 'x', text: 'y' }, { id: 'review', title: 'z', text: 'w' }, { title: 'new', text: 'n' }]);
  const ids = clean.templates.map((t) => t.id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(!['welcome', 'payment', 'reminder', 'goodbye', 'form', 'upgrade'].includes(ids[2]));
});

test('overlapping review saves cannot resurrect a withdrawn consent; erasure removes the review', async () => {
  const store = seed();
  const handle = createCrmHandler({ env, store, now: () => NOW });
  const admin = cookieFor('boss@gmail.com');
  const patch = (p) => handle(req('/api/crm?action=patch', { method: 'POST', cookie: admin, body: { id: ID, patch: p } }));
  await patch({ review: { text: 'טוב', consent: true } });
  // Slow down the first reviews.json read of the next request so the withdrawal overtakes it.
  const realGet = store.getJSON.bind(store);
  let slowed = false;
  store.getJSON = async (path, opts) => {
    if (path === 'crm/reviews.json' && !slowed) { slowed = true; await new Promise((r) => setTimeout(r, 60)); }
    return realGet(path, opts);
  };
  const a = patch({ review: { displayName: 'טוב', text: 'טוב' } });
  await new Promise((r) => setTimeout(r, 10));
  const b = patch({ review: { consent: false } });
  await Promise.all([a, b]);
  store.getJSON = realGet;
  const crm = JSON.parse(store.files.get(`submissions/${ID}/crm.json`).body);
  const reviews = JSON.parse(store.files.get('crm/reviews.json').body).reviews;
  assert.equal(!!(crm.review && crm.review.consent), reviews.length === 1, 'reviews.json agrees with crm.json');

  await patch({ review: { text: 'שוב טוב', consent: true } });
  await patch({ lost: { reason: 'erase_request' } });
  await handle(req('/api/crm?action=delete', { method: 'POST', cookie: admin, body: { id: ID } }));
  assert.equal(JSON.parse(store.files.get('crm/reviews.json').body).reviews.length, 0);
});
