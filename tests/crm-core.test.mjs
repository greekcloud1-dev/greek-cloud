import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeClient, stuckReasons, groupByFlight, groupByEntry, applyFilter, matchesQuery, phoneKey, relatedMap,
  copyText, waPhone, whatsappUrl, fillTemplate, calendarUrl, parsePasted, sanitizePatch, applyPatch,
  sanitizeManual, sanitizeTemplates, sanitizeUsers, classifySource, toCSV, computeStats, retentionDue,
  countdownLabel, agoLabel, isoDay, cityLabel, isValidISODate, historyText,
} from '../crm/core.js';

// 2026-09-23 12:00 Israel time.
const NOW = Date.parse('2026-09-23T09:00:00Z');
const DAY = 86400000;
const ago = (days) => new Date(NOW - days * DAY).toISOString();

function client(over = {}, crm = {}) {
  const record = {
    submissionId: over.id || 'id-00000001', receivedAt: ago(2), locale: 'he', plan: 'standard',
    fullName: 'דנה כהן', phone: '050-1234567', email: 'd@example.com', passport: '12345678',
    birthdate: '1990-03-14', city: 'כרתים', arrival: '2026-10-03', condition: 'כאבי גב', rxExists: 'past',
    consents: { c_age: true }, ...over,
  };
  return mergeClient(record.submissionId, record, crm, []);
}

test('isoDay uses Israel time, not UTC', () => {
  assert.equal(isoDay(Date.parse('2026-09-23T22:30:00Z')), '2026-09-24');
  assert.equal(isValidISODate('2026-02-30'), false);
  assert.equal(isValidISODate('2026-02-28'), true);
});

test('merge: our flight date wins over the form, "unknown" clears it', () => {
  assert.equal(client().flightDate, '2026-10-03');
  assert.equal(client({}, { flightDate: '2026-11-01' }).flightDate, '2026-11-01');
  assert.equal(client({}, { flightDate: null }).flightDate, null);
  assert.equal(client({}, { flightUnknown: true }).flightDate, null);
  assert.equal(client({ arrival: '', arrivalUnknown: true }).flightUnknown, true);
  assert.equal(client({ arrival: 'soon' }).flightDate, null);
});

test('stuck: no contact after 24h, and unpaid / no Rx within 3 days of flying', () => {
  assert.deepEqual(stuckReasons(client({ receivedAt: ago(0.5) }), NOW), []);
  assert.deepEqual(stuckReasons(client(), NOW), ['no_contact']);
  assert.deepEqual(stuckReasons(client({}, { contacted: true }), NOW), []);
  const soon = client({ arrival: '2026-09-25' }, { contacted: true });
  assert.deepEqual(stuckReasons(soon, NOW), ['unpaid_soon', 'no_rx_soon']);
  assert.deepEqual(stuckReasons(client({ arrival: '2026-09-25' }, { contacted: true, paid: true, rxIssued: true }), NOW), []);
  assert.deepEqual(stuckReasons(client({ arrival: '2026-09-20' }), NOW), [], 'trip over');
  assert.deepEqual(stuckReasons(client({ receivedAt: ago(45) }), NOW), [], 'cold after a month');
  assert.deepEqual(stuckReasons(client({}, { lost: { reason: 'expensive' } }), NOW), []);
});

test('grouping by flight: this week, months, unknown, past', () => {
  const list = [
    client({ id: 'a-00000001', arrival: '2026-09-25' }),
    client({ id: 'b-00000001', arrival: '2026-11-02' }),
    client({ id: 'c-00000001', arrival: '2026-10-15' }),
    client({ id: 'd-00000001', arrival: '' }),
    client({ id: 'e-00000001', arrival: '2026-09-01' }),
    client({ id: 'f-00000001', arrival: '2026-09-23' }),
  ];
  const g = groupByFlight(list, NOW);
  assert.deepEqual(g.map((x) => x.key), ['week', '2026-10', '2026-11', 'unknown', 'past']);
  assert.deepEqual(g[0].items.map((c) => c.id), ['f-00000001', 'a-00000001']);
  assert.equal(g[1].title, 'אוקטובר 2026');
  assert.equal(g[4].collapsed, true);
});

test('grouping by entry: today, this week, then months', () => {
  const g = groupByEntry([
    client({ id: 'a-00000001', receivedAt: ago(0.1) }),
    client({ id: 'b-00000001', receivedAt: ago(3) }),
    client({ id: 'c-00000001', receivedAt: ago(40) }),
  ], NOW);
  assert.deepEqual(g.map((x) => x.title), ['היום', 'השבוע', 'אוגוסט 2026']);
});

test('filters and search (name, phone in any format, passport)', () => {
  const a = client({ id: 'a-00000001' });
  const b = client({ id: 'b-00000001', fullName: 'Avi Levi', phone: '+972 54 765 4321', passport: '87654321' }, { lost: { reason: 'no_answer' } });
  assert.equal(applyFilter([a, b], 'active', NOW).length, 1);
  assert.equal(applyFilter([a, b], 'lost', NOW)[0].id, 'b-00000001');
  assert.equal(applyFilter([a, b], 'stuck', NOW)[0].id, 'a-00000001');
  assert.ok(matchesQuery(b, 'avi'));
  assert.ok(matchesQuery(b, '054-7654321'));
  assert.ok(matchesQuery(b, '8765'));
  assert.ok(matchesQuery(a, 'כרתים'));
  assert.ok(!matchesQuery(a, 'avi'));
});

test('returning clients match on phone in any format or on passport', () => {
  assert.equal(phoneKey('050-1234567'), phoneKey('+972 50 123 4567'));
  assert.equal(phoneKey('00972501234567'), '501234567');
  const a = client({ id: 'a-00000001', receivedAt: ago(200), phone: '+972501234567', passport: '' });
  const b = client({ id: 'b-00000001', phone: '0501234567', passport: '' });
  const c = client({ id: 'c-00000001', phone: '0529999999', passport: '11112222' });
  const d = client({ id: 'd-00000001', phone: '0538888888', passport: '11112222' });
  const m = relatedMap([a, b, c, d]);
  assert.deepEqual(m.get('a-00000001'), ['b-00000001']);
  assert.deepEqual(m.get('c-00000001'), ['d-00000001']);
});

test('copy text: everything, or without medical/identity details', () => {
  const full = copyText(client());
  assert.match(full, /שם: דנה כהן/);
  assert.match(full, /דרכון: 12345678/);
  assert.match(full, /תאריך טיסה: 03\/10\/2026/);
  assert.match(full, /מצב רפואי:\nכאבי גב/);
  const safe = copyText(client(), { medical: false });
  assert.doesNotMatch(safe, /דרכון|כאבי גב|מרשם קיים|תאריך לידה/);
  assert.match(safe, /טלפון: 050-1234567/);
});

test('WhatsApp numbers and templates', () => {
  assert.equal(waPhone('050-123-4567'), '972501234567');
  assert.equal(waPhone('+30 694 123 4567'), '306941234567');
  assert.equal(waPhone('123'), '');
  const text = fillTemplate('היי {שם}, טיסה ל{עיר} ב-{תאריך_טיסה} ({מסלול}) {לא_קיים}', client({ plan: 'vip' }));
  assert.equal(text, 'היי דנה, טיסה לכרתים ב-03/10/2026 (VIP) {לא_קיים}');
  assert.match(whatsappUrl('0501234567', 'שלום'), /^https:\/\/wa\.me\/972501234567\?text=%D7%A9/);
});

test('calendar link carries first name and city only', () => {
  const url = calendarUrl(client(), 'https://greek-cloud.com/crm/#x');
  const q = new URL(url).searchParams;
  assert.equal(q.get('dates'), '20261003/20261004');
  assert.equal(q.get('text'), 'טיסה: דנה ← כרתים');
  assert.doesNotMatch(url, /12345678|%D7%9B%D7%90%D7%91/);
  assert.equal(calendarUrl(client({ arrival: '' })), '');
});

test('smart paste: Hebrew WhatsApp message', () => {
  const p = parsePasted('היי, קוראים לי דנה כהן\nטסה לכרתים ב-12/10\nהטלפון שלי 050-1234567\nדרכון 23456789\ndana@gmail.com', NOW);
  assert.equal(p.fullName, 'דנה כהן');
  assert.equal(p.phone, '050-1234567');
  assert.equal(p.passport, '23456789');
  assert.equal(p.email, 'dana@gmail.com');
  assert.equal(p.city, 'כרתים');
  assert.equal(p.flightDate, '2026-10-12');
});

test('smart paste: labelled fields, month names, past dates ignored', () => {
  const p = parsePasted('שם: אבי לוי\nנולד 01/02/1985\nמגיע לרודוס 3 בנובמבר\n+972 52 555 1234', NOW);
  assert.equal(p.fullName, 'אבי לוי');
  assert.equal(p.city, 'רודוס');
  assert.equal(p.flightDate, '2026-11-03');
  assert.equal(p.phone, '+972 52 555 1234');
  const e = parsePasted('Hi, my name is John Smith, flying to Athens on Oct 5. 054-1112222', NOW);
  assert.equal(e.fullName, 'John Smith');
  assert.equal(e.city, 'אתונה');
  assert.equal(e.flightDate, '2026-10-05');
  assert.equal(parsePasted('ok thanks', NOW).phone, '');
  assert.equal(parsePasted('מגיעה בינואר, 5.1', NOW).flightDate, '2027-01-05', 'rolls into next year');
});

test('patch validation rejects anything unexpected', () => {
  assert.equal(sanitizePatch({ paid: true }).ok, true);
  assert.equal(sanitizePatch({ paid: 'yes' }).ok, false);
  assert.equal(sanitizePatch({ flightDate: '2026-13-01' }).ok, false);
  assert.equal(sanitizePatch({ source: 'myspace' }).ok, false);
  assert.equal(sanitizePatch({ lost: { reason: 'bored' } }).ok, false);
  assert.equal(sanitizePatch({ role: 'admin' }).ok, false);
  assert.equal(sanitizePatch({}).ok, false);
  assert.equal(sanitizePatch({ notes: 'x'.repeat(5001) }).ok, false);
  assert.deepEqual(sanitizePatch({ lost: { reason: 'other', note: ' a ', extra: 1 } }).patch, { lost: { reason: 'other', note: 'a' } });
});

test('applyPatch stamps steps, logs history, merges rapid note edits', () => {
  const t0 = '2026-09-23T09:00:00.000Z';
  let crm = applyPatch({}, { paid: true }, 'a@x.com', t0);
  assert.equal(crm.paid, true);
  assert.equal(crm.stepsAt.paid, t0);
  assert.equal(crm.history.length, 1);
  assert.equal(historyText(crm.history[0]), 'סימן "שולם"');
  crm = applyPatch(crm, { paid: true }, 'a@x.com', t0);
  assert.equal(crm.history.length, 1, 'no-op is not logged');
  crm = applyPatch(crm, { notes: 'a' }, 'a@x.com', t0);
  crm = applyPatch(crm, { notes: 'ab' }, 'a@x.com', '2026-09-23T09:03:00.000Z');
  assert.equal(crm.history.length, 2, 'notes typed within minutes are one entry');
  assert.equal(crm.history[0].value, null, 'note text never lands in history');
  crm = applyPatch(crm, { paid: false }, 'b@x.com', t0);
  assert.equal(crm.stepsAt.paid, undefined);
  crm = applyPatch(crm, { lost: { reason: 'expensive', note: '' } }, 'b@x.com', t0);
  assert.equal(crm.lost.at, t0);
  crm = applyPatch(crm, { seen: true }, 'b@x.com', t0);
  assert.equal(crm.seenAt, t0);
});

test('manual client: required fields, defaults, contacted step', () => {
  assert.equal(sanitizeManual({ phone: '0501234567' }, NOW).error, 'missing:fullName');
  assert.equal(sanitizeManual({ fullName: 'x', phone: '12' }, NOW).error, 'missing:phone');
  const r = sanitizeManual({ fullName: ' רון ', phone: '0501234567', flightDate: '2026-10-10', source: 'friend', contacted: true, by: 'a@x.com', plan: 'gold' }, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.record.fullName, 'רון');
  assert.equal(r.record.entry, 'manual');
  assert.equal(r.record.plan, '');
  assert.match(r.record.submissionId, /^2026-09-23T09-00-00-000Z-[0-9a-f]{16}$/);
  assert.equal(r.crm.contacted, true);
  assert.equal(r.crm.source, 'friend');
  const c = mergeClient(r.record.submissionId, r.record, r.crm, []);
  assert.equal(c.flightDate, '2026-10-10');
  assert.equal(c.entry, 'manual');
});

test('templates and users are validated', () => {
  assert.equal(sanitizeTemplates([{ title: '', text: 'x' }]).ok, false);
  assert.equal(sanitizeTemplates(Array(17).fill({ title: 'a', text: 'b' })).ok, false);
  assert.equal(sanitizeTemplates([{ id: 'bad id!', title: 'a', text: 'b' }]).templates[0].id, 't1');
  const u = sanitizeUsers([{ email: 'Boss@Gmail.com' }, { email: 'b@x.com', role: 'admin' }, { email: 'b@x.com' }], 'boss@gmail.com');
  assert.deepEqual(u.users, [{ email: 'b@x.com', role: 'admin' }]);
  assert.equal(sanitizeUsers([{ email: 'nope' }], '').ok, false);
});

test('lead source classification', () => {
  assert.equal(classifySource({ refHost: 'www.google.co.il' }), 'google');
  assert.equal(classifySource({ utmSource: 'ig' }), 'instagram');
  assert.equal(classifySource({ refHost: 'l.facebook.com' }), 'facebook');
  assert.equal(classifySource({ refHost: 'chatgpt.com' }), 'ai');
  assert.equal(classifySource({}), 'direct');
  assert.equal(classifySource({ refHost: 'example.org' }), 'other');
});

test('CSV: BOM, escaping, formula guard, medical off by default', () => {
  const c = client({ fullName: '=HYPERLINK("x")', phone: '+972-50-1234567' }, { notes: 'a,"b"\nc' });
  const csv = toCSV([c]);
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /‎\+972-50-1234567/);
  assert.doesNotMatch(csv, /12345678|כאבי גב|a,""b""/, 'notes, passport and health stay out by default');
  const med = toCSV([c], { medical: true });
  assert.match(med, /12345678/);
  assert.match(med, /"a,""b""\nc"/);
});

test('stats', () => {
  const list = [
    client({ id: 'a-00000001', receivedAt: ago(1) }, { paid: true, stepsAt: { paid: ago(0.5) } }),
    client({ id: 'b-00000001', receivedAt: ago(2), arrival: '2026-09-28' }),
    client({ id: 'c-00000001', receivedAt: ago(40), city: 'Athens' }, { lost: { reason: 'expensive', at: ago(30) } }),
  ];
  const s = computeStats(list, NOW);
  assert.equal(s.leadsMonth, 2);
  assert.equal(s.paidMonth, 1);
  assert.equal(s.flyingMonth, 1);
  assert.equal(s.conversion, 33);
  assert.equal(s.topCity, 'כרתים');
  assert.equal(s.months.length, 6);
  assert.equal(s.months[5].leads, 2);
  assert.deepEqual(s.lostReasons.map((x) => x.label), ['יקר מדי']);
});

test('retention: 90 days after the trip or after "not relevant"', () => {
  assert.equal(retentionDue(client({ arrival: '2026-06-01' }), NOW), true);
  assert.equal(retentionDue(client({ arrival: '2026-08-01' }), NOW), false);
  assert.equal(retentionDue(client({ arrival: '' }, { lost: { reason: 'other', at: ago(100) } }), NOW), true);
});

test('labels', () => {
  assert.equal(countdownLabel('2026-09-23', '2026-09-23'), 'טס היום');
  assert.equal(countdownLabel('2026-09-28', '2026-09-23'), 'בעוד 5 ימים');
  assert.equal(countdownLabel('2026-09-20', '2026-09-23'), 'טס לפני 3 ימים');
  assert.equal(agoLabel(ago(3 / 24), NOW), 'לפני 3 שעות');
  assert.equal(agoLabel(ago(3), NOW), 'לפני 3 ימים');
  assert.equal(cityLabel('Crete'), 'כרתים');
  assert.equal(cityLabel('אחר / עדיין לא ידוע'), 'עוד לא ידוע');
});
