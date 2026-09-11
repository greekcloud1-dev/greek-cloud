/* QA-01 — the intake draft kept a passport number, contact details, the
   prescription answer and every signed consent in localStorage, with no
   expiry and no way for a visitor to clear it, while the privacy notice
   promised display preferences only.

   These tests load assets/intake-draft.js against a stub DOM and assert on
   what actually reaches storage, so a future edit that widens the rule fails
   here rather than on someone's shared phone. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../assets/intake-draft.js', import.meta.url), 'utf8');

const FIELDS = [
  'full_name', 'passport', 'phone', 'email', 'age', 'city', 'arrival', 'plan',
  'locale', 'description', 'website',
];
const CONSENTS = ['c_terms', 'c_age', 'c_accuracy', 'c_customs', 'c_liability', 'c_nopromise'];

function makeField(name, type = 'text') {
  return { name, type, value: '', checked: false, addEventListener() {}, focus() {} };
}

/* Just enough DOM for this one file: a form whose elements are addressable by
   name, a status paragraph, and a document that can mint the delete button. */
function makeEnv(stored) {
  const elements = [];
  for (const n of FIELDS) elements.push(makeField(n));
  for (const n of CONSENTS) elements.push(makeField(n, 'checkbox'));
  elements.push(makeField('rx_exists'));
  for (const f of elements) elements[f.name] = f;

  const listeners = {};
  const form = {
    elements,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent() { return true; },
    querySelector() { return null; },
  };

  const savedEl = {
    textContent: '', hidden: false,
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, focus() {},
    parentNode: { insertBefore() {} }, nextSibling: null,
  };

  const store = new Map(Object.entries(stored ?? {}));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  const button = { type: '', className: '', textContent: '', hidden: false, addEventListener() {} };
  const document = {
    documentElement: { lang: 'he', getAttribute: () => 'he' },
    querySelector: (sel) => (sel === '[data-intake]' ? form : sel === '[data-saved]' ? savedEl : null),
    createElement: () => button,
  };

  const sandbox = { window: {}, document, localStorage, Event: class {}, setTimeout, clearTimeout, Date };
  sandbox.window.localStorage = localStorage;
  return { sandbox, form, store, run: () => vm.runInNewContext(SOURCE, sandbox) };
}

const KEY = 'gc-intake-draft';

function fill(form, values) {
  for (const [k, v] of Object.entries(values)) {
    const f = form.elements[k];
    if (f.type === 'checkbox') f.checked = !!v;
    else f.value = v;
  }
}

test('a draft never stores identifiers, medical answers or consents', () => {
  const env = makeEnv();
  const captured = {};
  env.form.addEventListener = (type, fn) => { captured[type] = fn; };
  env.run();

  fill(env.form, {
    full_name: 'TEST VISITOR', passport: '12345678', phone: '0500000000',
    email: 'test@example.com', age: '41', description: 'test condition text',
    city: 'athens', arrival: '2026-09-16T14:30', plan: 'standard',
    locale: 'he', c_terms: true, c_age: true, c_accuracy: true,
  });
  captured.blur();

  const raw = env.store.get(KEY);
  assert.ok(raw, 'a draft was written');
  const saved = JSON.parse(raw);
  assert.deepEqual(Object.keys(saved.data).sort(), ['arrival', 'city', 'plan']);

  for (const banned of ['full_name', 'passport', 'phone', 'email', 'age', 'description', 'locale', ...CONSENTS]) {
    assert.ok(!(banned in saved.data), `${banned} must never be stored`);
  }
  assert.ok(!raw.includes('12345678'), 'the passport number is absent from the stored text');
  assert.ok(!raw.includes('test@example.com'), 'the email is absent from the stored text');
});

test('a draft written under the old, wider rule is erased on load', () => {
  const legacy = JSON.stringify({
    full_name: 'TEST VISITOR', passport: '12345678', email: 'test@example.com',
    c_terms: 'on', c_age: 'on', locale: 'he',
  });
  const env = makeEnv({ [KEY]: legacy });
  env.run();

  assert.equal(env.store.get(KEY), undefined, 'the legacy draft is removed from the device');
  assert.equal(env.form.elements.passport.value, '', 'nothing from it is restored');
  assert.equal(env.form.elements.email.value, '');
  assert.equal(env.form.elements.c_terms.checked, false, 'consents are not pre-ticked');
});

test('a draft older than its one-day life is dropped rather than restored', () => {
  const stale = JSON.stringify({
    v: 2, at: Date.now() - 25 * 60 * 60 * 1000,
    data: { city: 'athens', arrival: '2026-09-16T14:30', plan: 'standard' },
  });
  const env = makeEnv({ [KEY]: stale });
  env.run();

  assert.equal(env.store.get(KEY), undefined, 'the expired draft is removed');
  assert.equal(env.form.elements.city.value, '', 'nothing is restored from it');
});

test('a fresh draft restores only the three trip choices', () => {
  const fresh = JSON.stringify({
    v: 2, at: Date.now(),
    data: { city: 'athens', arrival: '2026-09-16T14:30', plan: 'standard' },
  });
  const env = makeEnv({ [KEY]: fresh });
  env.run();

  assert.equal(env.form.elements.city.value, 'athens');
  assert.equal(env.form.elements.arrival.value, '2026-09-16T14:30');
  assert.equal(env.form.elements.plan.value, 'standard');
  assert.equal(env.form.elements.full_name.value, '');
  assert.ok(env.store.get(KEY), 'a valid draft survives the load');
});

test('a Hebrew draft cannot force a locale onto the English form', () => {
  const fresh = JSON.stringify({ v: 2, at: Date.now(), data: { city: 'athens', locale: 'he' } });
  const env = makeEnv({ [KEY]: fresh });
  env.sandbox.document.documentElement.lang = 'en';
  env.sandbox.document.documentElement.getAttribute = () => 'en';
  env.run();

  assert.equal(env.form.elements.locale.value, '', 'locale is never restored from a draft');
});
