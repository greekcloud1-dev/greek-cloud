import {
  applyFilter, matchesQuery, groupByFlight, groupByEntry, stuckReasons, relatedMap, retentionDue,
  countdownLabel, agoLabel, formatDate, isoDay, daysUntil, ageOn, cityLabel, planLabel, rxLabel,
  copyText, whatsappUrl, fillTemplate, calendarUrl, parsePasted,
  computeStats, historyText, CITIES, SOURCES, LOST_REASONS, STEPS, STUCK_LABELS,
} from './core.js';

/* ---------- tiny helpers ---------- */

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* per-device convenience only */ } },
};

const ICONS = {
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  copy: '<rect width="13" height="13" x="8.5" y="8.5" rx="2.5"/><path d="M5 15.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.5a2 2 0 0 1 2 2"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
  cal: '<rect width="18" height="18" x="3" y="4" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  talk: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-3.7-.8L3 21l1.9-5.1A8.4 8.4 0 1 1 21 11.5z"/>',
  cash: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2.2"/><path d="M6 12h.01M18 12h.01"/>',
  rx: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6M9 15l2 2 4-4"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  down: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  undo: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  paste: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
};
const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.4 0 20.1 0 24s1 7.6 2.7 10.8l7.8-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';

/* ---------- state ---------- */

const S = {
  me: null, clients: [], templates: [], skew: 0,
  filter: new URLSearchParams(location.search).get('f') || 'active',
  view: store.get('gc-crm-view', 'flight'),
  q: '',
  collapsed: new Set(store.get('gc-crm-collapsed', ['past'])),
  related: new Map(),
};
const now = () => Date.now() + S.skew;
const byId = (id) => S.clients.find((c) => c.id === id);
const openId = () => { const h = decodeURIComponent(location.hash.slice(1)); return h && byId(h) ? h : null; };

/* ---------- api ---------- */

async function api(action, body, query = '') {
  const opts = body === undefined
    ? { method: 'GET' }
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  let res;
  try {
    res = await fetch(`/api/crm?action=${action}${query}`, { ...opts, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw Object.assign(new Error('offline'), { code: 'offline' });
  }
  if (res.status === 401) { showGate(''); throw Object.assign(new Error('auth'), { code: 'auth' }); }
  if (res.status === 503) { showGate('config'); throw Object.assign(new Error('config'), { code: 'config' }); }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw Object.assign(new Error(j.error || `http_${res.status}`), { code: j.error || res.status });
  }
  return res;
}
const apiJSON = async (action, body, query) => (await api(action, body, query)).json();

const ERRORS = {
  offline: 'אין חיבור לאינטרנט. נסה שוב.',
  busy: 'מישהו אחר שמר בדיוק עכשיו. נסה שוב.',
  admin_only: 'רק מנהל יכול לעשות את זה.',
  'missing:fullName': 'חסר שם.',
  'missing:phone': 'חסר טלפון תקין.',
  'bad:email': 'המייל לא נראה תקין.',
};
function fail(e) {
  if (e && (e.code === 'auth' || e.code === 'config')) return;
  toast(ERRORS[e && e.code] || 'משהו השתבש. נסה שוב.', true);
}

/* ---------- toast & clipboard ---------- */

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `show${err ? ' err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, err ? 3800 : 1800);
}

async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* nothing left to try */ }
    ta.remove();
  }
  toast('הועתק');
  if (btn) { btn.classList.add('ok'); setTimeout(() => btn.classList.remove('ok'), 1200); }
}

/* ---------- gate (login / not configured) ---------- */

const GATE_MSG = {
  denied: 'המייל הזה לא מורשה להיכנס. צריך שהמנהל יוסיף אותו בהגדרות.',
  google: 'ההתחברות עם Google לא הושלמה. נסה שוב.',
  state: 'פג תוקף ניסיון הכניסה. נסה שוב.',
};

function showGate(kind) {
  document.body.classList.remove('has-panel');
  const e = new URLSearchParams(location.search).get('e');
  if (kind === 'config' || e === 'config') {
    $('#app').innerHTML = `<div class="gate"><div class="gate-card">
      <img src="/crm/icon-192.png" alt="">
      <h1>ה-CRM עוד לא הוגדר</h1>
      <p>חסרים משתני סביבה ב-Vercel. אחרי שמגדירים אותם ועושים Redeploy, המסך הזה יהפוך למסך כניסה.</p>
      <ul><li><code>CRM_SESSION_SECRET</code></li><li><code>CRM_ADMIN_EMAIL</code></li>
      <li><code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code></li></ul>
    </div></div>`;
    return;
  }
  try { if (location.hash) sessionStorage.setItem('gc-crm-return', location.hash); } catch { /* optional */ }
  $('#app').innerHTML = `<div class="gate"><div class="gate-card">
    <img src="/crm/icon-192.png" alt="">
    <h1>GreekCloud CRM</h1>
    <p>כניסה עם חשבון Google מורשה</p>
    <a class="google-btn" href="/api/crm-auth">${GOOGLE_G}התחברות עם Google</a>
    ${GATE_MSG[e] ? `<p class="msg" role="alert">${esc(GATE_MSG[e])}</p>` : ''}
  </div></div>`;
}

/* ---------- shell ---------- */

function shell() {
  const initial = (S.me.email || '?')[0].toUpperCase();
  $('#app').innerHTML = `
    <header class="head"><div class="wrap bar">
      <a class="brand" href="#"><img src="/assets/favicon.svg" alt=""><b>GreekCloud</b><span>CRM</span></a>
      <button class="btn primary" data-act="new">${icon('plus')}<span>לקוח</span></button>
      <button class="btn icon ghost" data-act="settings" aria-label="הגדרות">${icon('gear')}</button>
      <div class="menu-wrap">
        <button class="avatar" data-act="account" aria-label="חשבון" aria-haspopup="true">${esc(initial)}</button>
        <div class="menu" id="account-menu" style="inset-inline-start:auto;inset-inline-end:0" hidden>
          <small>${esc(S.me.email)} · ${S.me.role === 'admin' ? 'מנהל' : 'משתמש'}</small><hr>
          <button data-act="logout">${icon('out')}יציאה</button>
        </div>
      </div>
    </div></header>
    <div class="wrap">
      <section class="stats" id="stats" aria-label="סיכום"></section>
      <div class="tools">
        <label class="search">${icon('search')}<span class="sr">חיפוש</span>
          <input id="q" type="search" placeholder="חיפוש: שם, טלפון, דרכון, מייל" autocomplete="off" enterkeyhint="search"></label>
        <div class="chips" id="chips" role="group" aria-label="סינון"></div>
        <div class="seg" role="group" aria-label="מיון">
          <button data-view="flight">לפי טיסה</button><button data-view="entry">לפי כניסה</button>
        </div>
      </div>
      <main class="main" id="list"></main>
    </div>
    <aside class="panel" id="panel" aria-label="כרטיס לקוח" hidden></aside>`;
}

/* ---------- list ---------- */

function visibleClients() {
  return applyFilter(S.clients, S.filter, now()).filter((c) => matchesQuery(c, S.q));
}

function renderStats() {
  const st = computeStats(S.clients, now());
  $('#stats').innerHTML = [
    [st.leadsMonth, 'לידים החודש'], [st.paidMonth, 'שילמו החודש'], [st.flyingMonth, 'טסים החודש'],
    [`${st.conversion}%`, 'המרה (כל הזמן)'], [st.topCity || '—', 'עיר מובילה (90 יום)'],
  ].map(([v, l]) => `<button class="tile" data-act="stats"><b>${esc(v)}</b><span>${esc(l)}</span></button>`).join('');
}

function renderChips() {
  const t = now();
  const count = (f) => applyFilter(S.clients, f, t).length;
  const chips = [['active', 'פעילים'], ['stuck', 'נתקעים'], ['all', 'הכול'], ['lost', 'לא רלוונטי']];
  if (S.me.role === 'admin' && count('retention')) chips.push(['retention', 'למחיקה']);
  $('#chips').innerHTML = chips.map(([f, l]) => {
    const n = count(f);
    const alert = (f === 'stuck' || f === 'retention') && n > 0;
    return `<button class="chip${alert ? ' alert' : ''}" data-filter="${f}" aria-pressed="${S.filter === f}">${l} <em>${n}</em></button>`;
  }).join('');
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
}

function cardHTML(c, t, today) {
  const reasons = stuckReasons(c, t);
  const d = c.flightDate ? daysUntil(c.flightDate, today) : null;
  const city = cityLabel(c.city);
  const sub = [city, c.receivedAt ? `נכנס ${agoLabel(c.receivedAt, t)}` : ''].filter(Boolean).join(' · ');
  const pills = Object.entries({ contacted: ['talk', 'קשר'], paid: ['cash', 'שולם'], rxIssued: ['rx', 'מרשם'] })
    .map(([k, [ic, l]]) => `<span class="pill${c[k] ? ' on' : ''}">${icon(ic)}${l}</span>`).join('');
  const lost = c.lost ? `<span class="pill">לא רלוונטי · ${esc(LOST_REASONS[c.lost.reason] || '')}</span>` : '';
  const stuck = reasons.length ? `<span class="pill warn">${icon('alert')}${esc(STUCK_LABELS[reasons[0]])}</span>` : '';
  return `<a class="card${reasons.length ? ' stuck' : ''}${c.lost ? ' lost' : ''}${openId() === c.id ? ' open' : ''}" href="#${esc(c.id)}">
    <div class="c-name">${c.seenAt ? '' : '<span class="dot" title="חדש"></span>'}<span class="nm">${esc(c.fullName || 'ללא שם')}</span>
      ${c.plan === 'vip' ? '<span class="tag vip">VIP</span>' : ''}${S.related.has(c.id) ? '<span class="tag back">חוזר</span>' : ''}${c.entry === 'manual' ? '<span class="tag">ידני</span>' : ''}</div>
    <div class="c-sub">${esc(sub)}</div>
    <div class="c-trip">${c.flightDate
      ? `<div class="c-date">${esc(formatDate(c.flightDate).slice(0, 5))}</div><div class="c-count${d !== null && d >= 0 && d <= 7 ? ' soon' : ''}">${esc(countdownLabel(c.flightDate, today))}</div>`
      : '<div class="c-date none">אין תאריך</div>'}</div>
    <div class="c-steps">${lost || pills}${stuck}</div>
  </a>`;
}

function renderList() {
  const t = now();
  const today = isoDay(t);
  const list = visibleClients();
  renderChips();
  if (!list.length) {
    const msg = S.q ? ['לא נמצא', 'נסה חיפוש אחר.']
      : S.filter === 'stuck' ? ['אין נתקעים', 'כולם מטופלים. יופי.']
      : !S.clients.length ? ['עוד אין לקוחות', 'פניות מהאתר יופיעו כאן אוטומטית, או שאפשר להוסיף לקוח ידנית.']
      : ['אין כאן כלום', ''];
    $('#list').innerHTML = `<div class="empty"><b>${msg[0]}</b>${esc(msg[1])}</div>`;
    return;
  }
  const groups = S.view === 'entry' ? groupByEntry(list, t) : groupByFlight(list, t);
  $('#list').innerHTML = groups.map((g) => {
    const closed = S.collapsed.has(g.key) && !S.q;
    return `<section class="grp${closed ? ' closed' : ''}${g.tone === 'hot' ? ' hot' : ''}">
      <button class="grp-h" data-group="${esc(g.key)}" aria-expanded="${!closed}"><b>${esc(g.title)}</b><span class="n">${g.items.length}</span>${icon('chev')}</button>
      ${closed ? '' : `<div class="cards">${g.items.map((c) => cardHTML(c, t, today)).join('')}</div>`}
    </section>`;
  }).join('');
}

/* ---------- panel ---------- */

function row(label, value, { copyKey, ltr, html } = {}) {
  if (!value && value !== 0) return '';
  const v = html ? value : esc(value);
  return `<div class="row"><span class="k">${label}</span><span class="v${ltr ? ' ltr' : ''}">${v}</span>${
    copyKey ? `<button class="copy" data-copy="${copyKey}" aria-label="העתקת ${label}">${icon('copy')}</button>` : '<span></span>'}</div>`;
}

function renderPanel() {
  const id = openId();
  const panel = $('#panel');
  document.body.classList.toggle('has-panel', !!id);
  if (!id) { panel.hidden = true; panel.innerHTML = ''; return; }
  const c = byId(id);
  const t = now();
  const today = isoDay(t);
  const reasons = stuckReasons(c, t);
  const city = cityLabel(c.city);
  const age = c.birthdate ? ageOn(c.birthdate, today) : c.age;
  const meta = [city, planLabel(c.plan), c.flightDate ? `${formatDate(c.flightDate)} · ${countdownLabel(c.flightDate, today)}` : 'אין תאריך טיסה']
    .filter(Boolean).join(' · ');
  const related = (S.related.get(c.id) || []).map(byId).filter(Boolean);
  const tel = c.phone ? `tel:${c.phone.replace(/[^\d+]/g, '')}` : '';
  const cal = calendarUrl(c, `${location.origin}/crm/#${c.id}`);
  const wa = whatsappUrl(c.phone, '');
  const files = c.files.map((f) => `<a class="btn" href="/api/crm?action=file&id=${encodeURIComponent(c.id)}&name=${encodeURIComponent(f)}" target="_blank" rel="noopener">${icon('file')}${f.startsWith('prescription') ? 'מרשם שצורף' : esc(f)}</a>`).join(' ');
  const consents = Object.entries(c.consents).filter(([, v]) => v).length;

  panel.hidden = false;
  panel.innerHTML = `
    <div class="p-head">
      <a class="btn icon ghost" href="#" aria-label="סגירה">${icon('back')}</a>
      <div><h2>${esc(c.fullName || 'ללא שם')}</h2><div class="p-meta">${esc(meta)}</div></div>
    </div>
    <div class="p-body">
      <div class="p-actions">
        <button class="btn primary" data-act="copy-all">${icon('copy')}העתק הכול</button>
        <button class="btn" data-act="copy-safe">בלי רפואי</button>
        ${wa ? `<div class="menu-wrap"><button class="btn wa" data-act="wa" aria-haspopup="true">${icon('chat')}וואטסאפ</button>
          <div class="menu" id="wa-menu" hidden>
            ${S.templates.map((tp) => `<button data-wa="${esc(tp.id)}">${esc(tp.title)}</button>`).join('')}
            <hr><a href="${esc(wa)}" target="_blank" rel="noopener noreferrer">שיחה ריקה</a>
          </div></div>` : ''}
        ${tel ? `<a class="btn icon" href="${esc(tel)}" aria-label="חיוג">${icon('phone')}</a>` : ''}
        ${cal ? `<a class="btn icon" href="${esc(cal)}" target="_blank" rel="noopener noreferrer" aria-label="הוספה ליומן Google">${icon('cal')}</a>` : ''}
      </div>

      ${reasons.length ? `<div class="banner stop">${icon('alert')}<span>${reasons.map((r) => esc(STUCK_LABELS[r])).join(' · ')}</span></div>` : ''}
      ${c.lost ? `<div class="banner muted"><span>לא רלוונטי · ${esc(LOST_REASONS[c.lost.reason] || '')}${c.lost.note ? ` — ${esc(c.lost.note)}` : ''}</span>
        <button class="btn" data-act="unlose">${icon('undo')}החזרה לפעילים</button></div>` : ''}

      <div class="steps">
        ${Object.entries({ contacted: 'talk', paid: 'cash', rxIssued: 'rx' }).map(([k, ic]) => `
          <button class="step" data-step="${k}" aria-pressed="${c[k]}">${icon(ic)}${STEPS[k]}
            <small>${c[k] && c.stepsAt[k] ? esc(formatDate(isoDay(Date.parse(c.stepsAt[k]))).slice(0, 5)) : ''}</small></button>`).join('')}
      </div>
      ${c.lost ? '' : '<button class="lost-link" data-act="lose">סימון כלא רלוונטי</button>'}

      <section class="sec"><h3>נסיעה</h3>
        <div class="row"><span class="k">תאריך טיסה</span><span class="v inline-inputs">
          <input type="date" data-field="flightDate" value="${esc(c.flightDate || '')}" ${c.flightUnknown ? 'disabled' : ''} aria-label="תאריך טיסה">
          <label class="check"><input type="checkbox" data-field="flightUnknown" ${c.flightUnknown ? 'checked' : ''}>עוד לא יודע</label>
        </span><span></span></div>
        ${c.formArrival && c.formArrival !== c.flightDate ? row('בטופס', formatDate(c.formArrival)) : ''}
        ${row('עיר', city, { copyKey: 'city' })}
        ${row('מסלול', planLabel(c.plan))}
      </section>

      <section class="sec"><h3>קשר</h3>
        ${row('טלפון', c.phone, { copyKey: 'phone', ltr: true })}
        ${row('מייל', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '', { copyKey: 'email', ltr: true, html: true })}
        <div class="row"><span class="k">מקור הגעה</span><span class="v"><select class="field" data-field="source" aria-label="מקור הגעה">
          <option value="">לא ידוע</option>${Object.entries(SOURCES).map(([k, l]) => `<option value="${k}"${c.source === k ? ' selected' : ''}>${l}</option>`).join('')}
        </select></span><span></span></div>
      </section>

      <section class="sec"><h3>זיהוי</h3>
        ${row('שם מלא', c.fullName, { copyKey: 'fullName' })}
        ${row('דרכון', c.passport, { copyKey: 'passport', ltr: true })}
        ${row('תאריך לידה', c.birthdate ? `${formatDate(c.birthdate)}${age !== null ? ` · גיל ${age}` : ''}` : (age ? `גיל ${age}` : ''), { copyKey: c.birthdate ? 'birthdate' : '' })}
      </section>

      ${c.condition || c.rxExists || c.files.length ? `<section class="sec"><h3>רפואי</h3>
        ${c.condition ? `<div class="row block"><span class="k">מצב רפואי</span><span class="v text">${esc(c.condition)}</span><button class="copy" data-copy="condition" aria-label="העתקת מצב רפואי">${icon('copy')}</button></div>` : ''}
        ${row('מרשם קיים', rxLabel(c.rxExists))}
        ${files ? `<div class="row"><span class="k">קבצים</span><span class="v">${files}</span><span></span></div>` : ''}
      </section>` : ''}

      <section class="sec"><h3>הערות</h3>
        <textarea class="notes" data-notes placeholder="מה חשוב לזכור על הלקוח…">${esc(c.notes)}</textarea>
        <small class="saved" id="notes-state"></small>
      </section>

      ${related.length ? `<section class="sec related"><h3>לקוח חוזר · ${related.length + 1} פניות</h3>
        ${related.map((r) => `<a href="#${esc(r.id)}"><span>${esc(r.fullName)}</span><span>${r.flightDate ? `טס ${esc(formatDate(r.flightDate))}` : `נכנס ${esc(formatDate(isoDay(Date.parse(r.receivedAt))))}`}</span></a>`).join('')}
      </section>` : ''}

      ${c.history.length ? `<details class="sec"><summary>היסטוריה</summary><ul class="hist">
        ${c.history.map((h) => `<li><span>${esc(h.by.split('@')[0])} ${esc(historyText(h))}</span><span>${esc(agoLabel(h.at, t))}</span></li>`).join('')}
      </ul></details>` : ''}

      <details class="sec"><summary>פרטי הפנייה</summary>
        ${row('נכנס', c.receivedAt ? new Date(c.receivedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }) : '')}
        ${row('ערוץ', c.entry === 'manual' ? 'הוזן ידנית' : `טופס באתר (${c.locale === 'en' ? 'אנגלית' : 'עברית'})`)}
        ${c.entry === 'web' ? row('הסכמות', `${consents} אושרו`) : ''}
        ${c.utm ? row('UTM', [c.utm.source, c.utm.medium, c.utm.campaign].filter(Boolean).join(' / '), { ltr: true }) : ''}
        ${c.refHost ? row('הגיע מ', c.refHost, { ltr: true }) : ''}
        ${row('מזהה', c.id, { copyKey: 'id', ltr: true })}
      </details>

      ${S.me.role === 'admin' ? `<div class="danger-zone"><button class="btn danger" data-act="delete">${icon('trash')}מחיקה לצמיתות</button></div>` : ''}
    </div>`;
}

function renderAll() {
  renderStats();
  renderList();
  renderPanel();
}

/* ---------- mutations ---------- */

async function patch(id, p, { quiet = false } = {}) {
  const c = byId(id);
  if (!c) return;
  const before = { ...c };
  Object.assign(c, p);
  if ('flightUnknown' in p && p.flightUnknown) c.flightDate = null;
  if (!quiet) renderAll();
  try {
    const { client } = await apiJSON('patch', { id, patch: p });
    // Keep what is being typed in the notes box; everything else comes from the server.
    Object.assign(c, client, { files: c.files, notes: c.notes });
    if (!quiet) renderAll();
    return true;
  } catch (e) {
    Object.assign(c, before);
    renderAll();
    fail(e);
    return false;
  }
}

let notesTimer;
function queueNotes(id, value) {
  const st = $('#notes-state');
  if (st) st.textContent = 'שומר…';
  byId(id).notes = value;
  clearTimeout(notesTimer);
  notesTimer = setTimeout(async () => {
    const ok = await patch(id, { notes: value }, { quiet: true });
    const s = $('#notes-state');
    if (s && openId() === id) s.textContent = ok ? 'נשמר' : 'לא נשמר';
  }, 900);
}

/* ---------- dialogs ---------- */

const dlg = () => $('#dlg');
function openDialog(html, onSubmit) {
  const d = dlg();
  d.innerHTML = html;
  d._submit = onSubmit;
  if (!d.open) d.showModal();
  const first = d.querySelector('[autofocus]');
  if (first) first.focus();
}
const closeDialog = () => { const d = dlg(); if (d.open) d.close(); };
const dHead = (title) => `<div class="d-head"><h2 id="dlg-title">${esc(title)}</h2><button class="btn icon ghost" data-act="close-dialog" aria-label="סגירה">${icon('close')}</button></div>`;

function newClientDialog() {
  const cityOpts = CITIES.map((c) => `<option>${c.he}</option>`).join('');
  openDialog(`<form method="dialog" data-form="new">${dHead('לקוח חדש')}
    <div class="d-body">
      <label class="lbl">הדבקה חכמה — הודבקה הודעה, והמערכת תמלא לבד
        <textarea class="paste" id="paste" placeholder="למשל: היי, אני דנה כהן, טסה לכרתים ב-12/10, 050-1234567" autofocus></textarea></label>
      <p class="hint" id="paste-hint">אפשר גם פשוט למלא ידנית.</p>
      <div class="form-grid">
        <label class="lbl">שם מלא *<input class="field" name="fullName" required></label>
        <label class="lbl">טלפון *<input class="field ltr" name="phone" type="tel" required></label>
        <label class="lbl">מייל<input class="field ltr" name="email" type="email"></label>
        <label class="lbl">דרכון<input class="field ltr" name="passport" inputmode="numeric"></label>
        <label class="lbl">עיר<input class="field" name="city" list="city-list"><datalist id="city-list">${cityOpts}</datalist></label>
        <label class="lbl">תאריך טיסה<input class="field" name="flightDate" type="date"></label>
        <label class="lbl">מסלול<select class="field" name="plan"><option value="">—</option><option value="standard">סטנדרט</option><option value="vip">VIP</option></select></label>
        <label class="lbl">מקור הגעה<select class="field" name="source"><option value="">לא ידוע</option>${Object.entries(SOURCES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="lbl full">הערות<textarea class="field" name="notes"></textarea></label>
        <label class="check full"><input type="checkbox" name="contacted" checked>כבר דיברנו איתו</label>
      </div>
      <p class="hint" id="dup-hint" hidden></p>
    </div>
    <div class="d-foot"><button type="button" class="btn" data-act="close-dialog">ביטול</button><button class="btn primary" type="submit">שמירה</button></div>
  </form>`, async (form) => {
    const f = new FormData(form);
    const body = Object.fromEntries(['fullName', 'phone', 'email', 'passport', 'city', 'flightDate', 'plan', 'source', 'notes'].map((k) => [k, String(f.get(k) || '')]));
    body.contacted = f.get('contacted') === 'on';
    const { client } = await apiJSON('create', { client: body });
    S.clients.push(client);
    S.related = relatedMap(S.clients);
    closeDialog();
    location.hash = client.id;
    renderAll();
    toast('הלקוח נשמר');
  });
}

function onPaste(text) {
  const form = $('[data-form="new"]');
  if (!form) return;
  const p = parsePasted(text, now());
  const found = [];
  const setIf = (name, v, label) => { if (v) { form.elements[name].value = v; found.push(label); } };
  setIf('fullName', p.fullName, 'שם');
  setIf('phone', p.phone, 'טלפון');
  setIf('email', p.email, 'מייל');
  setIf('passport', p.passport, 'דרכון');
  setIf('city', p.city, 'עיר');
  setIf('flightDate', p.flightDate, 'תאריך טיסה');
  const hint = $('#paste-hint');
  hint.textContent = found.length ? `זוהו: ${found.join(', ')}. כדאי לעבור ולוודא.` : 'לא זוהו פרטים. אפשר למלא ידנית.';
  hint.classList.toggle('ok', found.length > 0);
  checkDuplicate();
}

function checkDuplicate() {
  const form = $('[data-form="new"]');
  if (!form) return;
  const probe = { id: '__new', phone: form.elements.phone.value, passport: form.elements.passport.value, receivedAt: '' };
  const hits = (relatedMap([...S.clients, probe]).get('__new') || []).map(byId).filter(Boolean);
  const h = $('#dup-hint');
  h.hidden = !hits.length;
  h.innerHTML = hits.length ? `${icon('alert')} כבר קיים לקוח עם אותו טלפון/דרכון: ${hits.map((c) => `<a href="#${esc(c.id)}" data-act="close-dialog">${esc(c.fullName)}</a>`).join(', ')}` : '';
}

function loseDialog(id) {
  openDialog(`<form method="dialog" data-form="lose">${dHead('למה לא רלוונטי?')}
    <div class="d-body"><div class="radio-list">
      ${Object.entries(LOST_REASONS).map(([k, l], i) => `<label><input type="radio" name="reason" value="${k}"${i === 0 ? ' checked' : ''}>${l}</label>`).join('')}
    </div><label class="lbl">פירוט (לא חובה)<input class="field" name="note" maxlength="300"></label></div>
    <div class="d-foot"><button type="button" class="btn" data-act="close-dialog">ביטול</button><button class="btn primary" type="submit">שמירה</button></div>
  </form>`, async (form) => {
    const f = new FormData(form);
    closeDialog();
    await patch(id, { lost: { reason: String(f.get('reason')), note: String(f.get('note') || '') } });
  });
}

function deleteDialog(id) {
  const c = byId(id);
  openDialog(`<form method="dialog" data-form="delete">${dHead('מחיקה לצמיתות')}
    <div class="d-body">
      <p class="hint">כל הפרטים והקבצים של <b>${esc(c.fullName)}</b> יימחקו ולא יהיה אפשר לשחזר אותם. לאישור, הקלד את השם המלא:</p>
      <input class="field" name="confirm" autocomplete="off" autofocus>
    </div>
    <div class="d-foot"><button type="button" class="btn" data-act="close-dialog">ביטול</button><button class="btn danger solid" type="submit">מחיקה</button></div>
  </form>`, async (form) => {
    if (String(new FormData(form).get('confirm')).trim() !== c.fullName.trim()) { toast('השם לא תואם', true); return; }
    await apiJSON('delete', { id });
    S.clients = S.clients.filter((x) => x.id !== id);
    S.related = relatedMap(S.clients);
    closeDialog();
    location.hash = '';
    renderAll();
    toast('נמחק');
  });
}

function statsDialog() {
  const st = computeStats(S.clients, now());
  const max = Math.max(1, ...st.months.map((m) => m.leads));
  const list = (items) => items.length ? `<div class="kv-list">${items.map((x) => `<div><span>${esc(x.label)}</span><b>${x.count}</b></div>`).join('')}</div>` : '<p class="hint">עוד אין נתונים.</p>';
  const due = S.clients.filter((c) => retentionDue(c, now())).length;
  openDialog(`<div>${dHead('סטטיסטיקה')}<div class="d-body">
    <h4>לידים ותשלומים לפי חודש</h4>
    <div class="bars">${st.months.map((m) => `<div class="bar-col"><b>${m.leads}</b><div class="b" style="height:${(m.leads / max) * 100}%"><i style="height:${m.leads ? (m.paid / m.leads) * 100 : 0}%"></i></div>${esc(m.label)}</div>`).join('')}</div>
    <div class="legend"><span><i></i>לידים</span><span><i class="p"></i>מתוכם שילמו</span></div>
    <h4>מאיפה מגיעים</h4>${list(st.bySource)}
    <h4>ערים (90 יום אחרונים)</h4>${list(st.byCity)}
    <h4>למה לא רלוונטי</h4>${list(st.lostReasons)}
    ${S.me.role === 'admin' && due ? `<div class="banner stop">${icon('alert')}<span>${due === 1 ? 'לקוח אחד עבר' : `${due} לקוחות עברו`} 3 חודשים מסגירת הפנייה. לפי מדיניות הפרטיות צריך ${due === 1 ? 'למחוק אותו' : 'למחוק אותם'}.</span>
      <button class="btn" data-filter="retention" data-act="close-dialog">הצג</button></div>` : ''}
  </div></div>`);
}

async function settingsDialog() {
  const admin = S.me.role === 'admin';
  let users = [];
  let adminEmail = '';
  if (admin) {
    try { ({ users, adminEmail } = await apiJSON('users')); } catch (e) { fail(e); }
  }
  const tplHTML = (tp, i) => `<div class="tpl" data-tpl="${i}">
    <div class="tpl-top"><input class="field" name="title" value="${esc(tp.title)}" maxlength="40" aria-label="שם התבנית">
      <button type="button" class="btn icon ghost" data-act="tpl-del" aria-label="מחיקת תבנית">${icon('trash')}</button></div>
    <textarea class="field" name="text" rows="3" maxlength="1000" aria-label="נוסח">${esc(tp.text)}</textarea></div>`;
  openDialog(`<div>${dHead('הגדרות')}<div class="d-body">
    <h4>תבניות וואטסאפ</h4>
    <p class="hint">אפשר להשתמש ב: {שם} {שם_מלא} {תאריך_טיסה} {עיר} {מסלול}</p>
    <div id="tpls" style="display:grid;gap:10px">${S.templates.map(tplHTML).join('')}</div>
    <div style="display:flex;gap:8px"><button class="btn" data-act="tpl-add">${icon('plus')}תבנית</button>
      <button class="btn primary" data-act="tpl-save">שמירת תבניות</button></div>
    ${admin ? `
      <h4>משתמשים</h4>
      <div id="users">
        <div class="user-row"><span>${esc(adminEmail || S.me.email)}</span><span class="tag vip">מנהל ראשי</span></div>
        ${users.map((u) => `<div class="user-row" data-user="${esc(u.email)}" data-role="${u.role}"><span>${esc(u.email)}</span>
          <span class="tag">${u.role === 'admin' ? 'מנהל' : 'משתמש'}</span>
          <button class="btn icon ghost" data-act="user-del" aria-label="הסרה">${icon('trash')}</button></div>`).join('')}
      </div>
      <form data-form="user-add" style="display:flex;gap:8px;flex-wrap:wrap">
        <input class="field ltr" name="email" type="email" placeholder="email@gmail.com" required style="flex:1 1 200px">
        <select class="field" name="role"><option value="member">משתמש</option><option value="admin">מנהל</option></select>
        <button class="btn" type="submit">${icon('plus')}הוספה</button>
      </form>
      <h4>ייצוא לאקסל</h4>
      <p class="hint">מייצא את הרשימה כפי שהיא מסוננת עכשיו (${visibleClients().length} לקוחות).</p>
      <label class="check"><input type="checkbox" id="exp-med">כולל מידע רפואי ומספרי דרכון</label>
      <div><button class="btn" data-act="export">${icon('down')}הורדת קובץ</button></div>` : ''}
  </div></div>`);
}

function readTemplates() {
  return [...document.querySelectorAll('[data-tpl]')].map((el, i) => ({
    id: S.templates[+el.dataset.tpl]?.id || `t${i + 1}`,
    title: el.querySelector('[name="title"]').value,
    text: el.querySelector('[name="text"]').value,
  }));
}

async function saveUsers(list) {
  const { users } = await apiJSON('users', { users: list });
  toast('נשמר');
  return users;
}

async function exportCSV() {
  const medical = $('#exp-med')?.checked === true;
  const res = await api('export', { ids: visibleClients().map((c) => c.id), medical });
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `greekcloud-clients-${isoDay(now())}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- events ---------- */

function closeMenus(except) {
  document.querySelectorAll('.menu').forEach((m) => { if (m !== except) m.hidden = true; });
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  const menuBtn = t.closest('[data-act="wa"], [data-act="account"]');
  if (!t.closest('.menu') && !menuBtn) closeMenus();

  const filter = t.closest('[data-filter]');
  if (filter) {
    S.filter = filter.dataset.filter;
    history.replaceState(null, '', `${location.pathname}${S.filter === 'active' ? '' : `?f=${S.filter}`}${location.hash}`);
    renderList();
  }
  const view = t.closest('[data-view]');
  if (view) { S.view = view.dataset.view; store.set('gc-crm-view', S.view); renderList(); }
  const grp = t.closest('[data-group]');
  if (grp) {
    const k = grp.dataset.group;
    if (S.collapsed.has(k)) S.collapsed.delete(k); else S.collapsed.add(k);
    store.set('gc-crm-collapsed', [...S.collapsed]);
    renderList();
  }

  const step = t.closest('[data-step]');
  if (step) { const id = openId(); await patch(id, { [step.dataset.step]: !byId(id)[step.dataset.step] }); return; }

  const cp = t.closest('[data-copy]');
  if (cp) {
    const c = byId(openId());
    const k = cp.dataset.copy;
    copy(k === 'city' ? cityLabel(c.city) : k === 'birthdate' ? formatDate(c.birthdate) : String(c[k] ?? ''), cp);
    return;
  }

  const waT = t.closest('[data-wa]');
  if (waT) {
    const c = byId(openId());
    const tp = S.templates.find((x) => x.id === waT.dataset.wa);
    window.open(whatsappUrl(c.phone, fillTemplate(tp.text, c)), '_blank', 'noopener,noreferrer');
    closeMenus();
    return;
  }

  const act = t.closest('[data-act]');
  if (!act) return;
  const id = openId();
  try {
    switch (act.dataset.act) {
      case 'new': newClientDialog(); break;
      case 'settings': await settingsDialog(); break;
      case 'stats': statsDialog(); break;
      case 'account': { const m = $('#account-menu'); closeMenus(m); m.hidden = !m.hidden; break; }
      case 'wa': { const m = $('#wa-menu'); closeMenus(m); m.hidden = !m.hidden; break; }
      case 'logout':
        await api('logout', {}).catch(() => {});
        location.replace('/crm/');
        break;
      case 'copy-all': copy(copyText(byId(id), { medical: true })); break;
      case 'copy-safe': copy(copyText(byId(id), { medical: false })); break;
      case 'lose': loseDialog(id); break;
      case 'unlose': await patch(id, { lost: null }); break;
      case 'delete': deleteDialog(id); break;
      case 'close-dialog': closeDialog(); break;
      case 'tpl-add': {
        const box = $('#tpls');
        const i = box.children.length;
        box.insertAdjacentHTML('beforeend', `<div class="tpl" data-tpl="${i}"><div class="tpl-top"><input class="field" name="title" placeholder="שם התבנית" maxlength="40">
          <button type="button" class="btn icon ghost" data-act="tpl-del" aria-label="מחיקת תבנית">${icon('trash')}</button></div>
          <textarea class="field" name="text" rows="3" maxlength="1000" placeholder="היי {שם}, …"></textarea></div>`);
        box.lastElementChild.querySelector('input').focus();
        break;
      }
      case 'tpl-del': act.closest('.tpl').remove(); break;
      case 'tpl-save': {
        const { templates } = await apiJSON('templates', { templates: readTemplates().filter((x) => x.title.trim() && x.text.trim()) });
        S.templates = templates;
        toast('התבניות נשמרו');
        renderPanel();
        break;
      }
      case 'user-del': {
        const rowEl = act.closest('[data-user]');
        const rest = [...document.querySelectorAll('[data-user]')].filter((r) => r !== rowEl).map((r) => ({ email: r.dataset.user, role: r.dataset.role }));
        await saveUsers(rest);
        rowEl.remove();
        break;
      }
      case 'export': await exportCSV(); break;
      case 'reload': location.reload(); break;
      default: break;
    }
  } catch (err) { fail(err); }
});

document.addEventListener('change', (e) => {
  const f = e.target.closest('[data-field]');
  if (!f) return;
  const id = openId();
  const k = f.dataset.field;
  if (k === 'flightDate') patch(id, { flightDate: f.value || null });
  else if (k === 'flightUnknown') patch(id, f.checked ? { flightUnknown: true } : { flightUnknown: false });
  else if (k === 'source') patch(id, { source: f.value || null });
});

let qTimer;
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { S.q = e.target.value; renderList(); }, 120);
  } else if (e.target.matches('[data-notes]')) {
    queueNotes(openId(), e.target.value);
  } else if (e.target.id === 'paste') {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => onPaste(e.target.value), 250);
  } else if (e.target.closest('[data-form="new"]') && ['phone', 'passport'].includes(e.target.name)) {
    checkDuplicate();
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (form.matches('[data-form="user-add"]')) {
    e.preventDefault();
    const f = new FormData(form);
    const current = [...document.querySelectorAll('[data-user]')].map((r) => ({ email: r.dataset.user, role: r.dataset.role }));
    try {
      await saveUsers([...current, { email: String(f.get('email')), role: String(f.get('role')) }]);
      await settingsDialog();
    } catch (err) { fail(err); }
    return;
  }
  const d = dlg();
  if (d.contains(form) && d._submit) {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    try { await d._submit(form); } catch (err) { fail(err); } finally { if (btn) btn.disabled = false; }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openId() && !dlg().open) { location.hash = ''; }
  if (e.key === '/' && !e.target.closest('input, textarea, select') && !dlg().open) { e.preventDefault(); $('#q')?.focus(); }
});

window.addEventListener('hashchange', () => {
  const id = openId();
  const c = id && byId(id);
  if (c && !c.seenAt) patch(id, { seen: true }, { quiet: true }).then(() => renderList());
  renderList();
  renderPanel();
  if (id) $('#panel').scrollTop = 0;
});

// Coming back to the tab after a while: pick up leads that arrived meanwhile.
let lastLoad = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.me && Date.now() - lastLoad > 60000 && !dlg().open) load();
});

/* ---------- boot ---------- */

async function load() {
  const data = await apiJSON('list');
  lastLoad = Date.now();
  S.skew = data.now - Date.now();
  S.clients = data.clients;
  S.templates = data.templates;
  S.related = relatedMap(S.clients);
  const first = !S.me;
  S.me = data.me;
  if (first) {
    shell();
    const back = (() => { try { const h = sessionStorage.getItem('gc-crm-return'); sessionStorage.removeItem('gc-crm-return'); return h; } catch { return null; } })();
    if (back && !location.hash) history.replaceState(null, '', `${location.pathname}${location.search.replace(/[?&]e=[^&]*/, '')}${back}`);
  }
  renderAll();
  const id = openId();
  if (first && id && !byId(id).seenAt) patch(id, { seen: true }, { quiet: true }).then(() => renderList());
}

load().catch((e) => {
  if (e.code === 'auth' || e.code === 'config') return;
  $('#app').innerHTML = `<div class="gate"><div class="gate-card"><h1>לא הצלחתי לטעון</h1><p>${esc(ERRORS[e.code] || 'בדוק את החיבור ונסה שוב.')}</p><button class="btn primary" data-act="reload">נסה שוב</button></div></div>`;
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/crm/sw.js', { scope: '/crm/' }).catch(() => {});
}
